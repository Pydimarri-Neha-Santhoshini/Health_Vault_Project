from flask import Blueprint, jsonify, request, render_template
from app.middleware.auth import require_auth
from supabase import create_client, Client, ClientOptions
import uuid
import datetime
import os
import socket

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

bp = Blueprint('emergency', __name__)

def get_supabase_client():
    """Initializes a Supabase client with optional user context."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("DEBUG: Supabase URL or Key missing in ENV")
        return None
        
    auth_header = request.headers.get('Authorization')
    client = create_client(url, key)
    
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        client.postgrest.auth(token)
        # Also set auth for other sub-clients if needed
    
    return client

@bp.route('/generate-emergency', methods=['POST'])
@require_auth
def generate_emergency():
    """Generates an emergency access token and revokes old ones."""
    try:
        supabase = get_supabase_client()
        if not supabase: raise Exception("Supabase client not initialized")
            
        user_id = getattr(request, 'user_id')
        data = request.json or {}
        duration_hours = int(data.get('duration_hours', 24))
        
        # 1. Revoke existing tokens for user
        supabase.table('emergency_access').delete().eq('user_id', user_id).execute()
        
        # 2. Create a new token
        token = str(uuid.uuid4().hex)
        expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=duration_hours)
            
        # 3. Store the token in DB
        ins_res = supabase.table('emergency_access').insert({
            "user_id": user_id,
            "token": token,
            "expires_at": expires_at.isoformat()
        }).execute()
        
        if not ins_res.data:
            raise Exception("Failed to store emergency token.")
            
        # 4. Build network URL
        api_public_url = os.getenv("API_PUBLIC_URL")
        if api_public_url:
            network_url = f"{api_public_url.rstrip('/')}/api/emergency/{token}"
        else:
            port = os.getenv("PORT", 5000)
            local_ip = get_local_ip()
            network_url = f"http://{local_ip}:{port}/api/emergency/{token}"
        
        return jsonify({
            "token": token,
            "expires_at": expires_at.isoformat(),
            "url": f"/emergency/{token}",
            "network_url": network_url
        }), 201
    except Exception as e:
        print(f"DEBUG Error generate_emergency: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route('/current-token', methods=['GET'])
@require_auth
def get_current_token():
    """Fetches the user's active emergency token from the backend."""
    try:
        supabase = get_supabase_client()
        user_id = getattr(request, 'user_id')
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        res = supabase.table('emergency_access').select('token, expires_at').eq('user_id', user_id).gt('expires_at', now).maybe_single().execute()
        if res and res.data:
            token = res.data['token']
            api_public_url = os.getenv("API_PUBLIC_URL")
            if api_public_url:
                res.data['network_url'] = f"{api_public_url.rstrip('/')}/api/emergency/{token}"
            else:
                port = os.getenv("PORT", 5000)
                local_ip = get_local_ip()
                res.data['network_url'] = f"http://{local_ip}:{port}/api/emergency/{token}"
            return jsonify(res.data), 200
        return jsonify(None), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route('/revoke-emergency', methods=['DELETE'])
@require_auth
def revoke_emergency():
    """Deletes the current emergency token."""
    try:
        supabase = get_supabase_client()
        if not supabase: return jsonify({"error": "Supabase not configured"}), 500
        
        user_id = getattr(request, 'user_id')
        supabase.table('emergency_access').delete().eq('user_id', user_id).execute()
        return jsonify({"message": "Emergency token revoked successfully"}), 200
    except Exception as e:
        print(f"DEBUG Error revoke_emergency: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/<token>', methods=['GET'])
def get_emergency_view(token):
    """Serves the emergency medical dashboard snapshot dynamically."""
    try:
        # 1. Use service role key to check DB and fetch data (bypass RLS)
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        service_client = create_client(supabase_url, supabase_service_key)
        
        # 2. Check if token exists and is valid
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        res = service_client.table('emergency_access').select('*').eq('token', token).gt('expires_at', now).maybe_single().execute()
        
        if not res or not res.data:
            print(f"DEBUG: Emergency access denied for token {token} (Expired or Invalid)")
            return render_template('emergency_error.html', error="This emergency QR code has expired or is no longer valid."), 403

        user_id = res.data['user_id']
        expires_at_str = res.data['expires_at']
        
        # 3. Fetch Patient Info
        user_data = {}
        try:
            user_res = service_client.table('users').select('*').eq('id', user_id).maybe_single().execute()
            user_data = user_res.data if user_res else {}
        except Exception as e:
            print(f"DEBUG Warning: Profile lookup failed: {e}")
            
        # 4. Fetch Timeline (last 50 records)
        records_res = service_client.table('records').select('id, title, date, type, file_url').eq('user_id', user_id).order('date', desc=True).limit(50).execute()
        timeline = records_res.data or []
        
        # 5. Fetch AI Insights
        latest_record_ids = [r.get('id') for r in (records_res.data or []) if r.get('id')]
        insights = []
        global_summary = ""
        
        if latest_record_ids:
            insights_res = service_client.table('insights').select('recommendations, record_id').in_('record_id', latest_record_ids[:10]).execute()
            if insights_res.data:
                seen = set()
                title_map = {r['id']: r.get('title', 'Unknown Record') for r in timeline}
                for i in insights_res.data:
                    rec = i.get('recommendations')
                    record_id = i.get('record_id')
                    rep_title = title_map.get(record_id, 'Report Insight') if record_id else 'Report Insight'
                    
                    if rec and rec.strip() and rec not in seen:
                        insights.append({
                            "text": rec, 
                            "report_title": rep_title,
                            "date": "Recent"
                        })
                        seen.add(rec)
                    if len(insights) >= 8: break

        # Global Summary
        settings = user_data.get('settings', {})
        if isinstance(settings, dict):
            global_summary = settings.get('global_insights', {}).get('summary', "")
            
        # Parse expiry date for display
        try:
            expiry_dt = datetime.datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            expiry_display = expiry_dt.strftime("%Y-%m-%d %H:%M UTC")
        except:
            expiry_display = "Unknown Expiry"

        # 6. Render Template dynamically
        return render_template('emergency_snapshot.html', 
                               patient={
                                   "name": user_data.get('name', 'Patient'),
                                   "blood_group": user_data.get('blood_group', 'Not Provided'),
                                   "emergency_contact": user_data.get('emergency_contact', 'None')
                               },
                               timeline=timeline,
                               insights=insights,
                               global_summary=global_summary,
                               expiry=expiry_display)
        
    except Exception as e:
        print(f"DEBUG Error get_emergency_view: {str(e)}")
        import traceback
        traceback.print_exc()
        return render_template('emergency_error.html', error="A system error occurred while verifying the token."), 500
