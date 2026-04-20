from flask import Blueprint, jsonify, request, render_template, send_from_directory, current_app
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

def generate_static_snapshot(user_id, token, expires_at):
    """Generates a static HTML snapshot of the patient data."""
    try:
        supabase = get_supabase_client()
        if not supabase: return False
        
        # 1. Fetch Patient Info
        print(f"DEBUG: Fetching user info for ID: {user_id}")
        user_data = {}
        try:
            user_res = supabase.table('users').select('*').eq('id', user_id).maybe_single().execute()
            user_data = user_res.data if user_res else {}
        except Exception as e:
            print(f"DEBUG Warning: Profile lookup failed: {e}")
            
        print(f"DEBUG: User data fetched: {bool(user_data)}")
        
        # 2. Fetch Timeline (last 50 records)
        records_res = supabase.table('records').select('id, title, date, type, file_url').eq('user_id', user_id).order('date', desc=True).limit(50).execute()
        timeline = records_res.data or []
        
        # 3. Fetch AI Insights
        # We look for insights from the most recent 10 records for the snapshot breadth
        latest_record_ids = [r.get('id') for r in (records_res.data or []) if r.get('id')]
        insights = []
        global_summary = ""
        
        if latest_record_ids:
            insights_res = supabase.table('insights').select('recommendations, record_id').in_('record_id', latest_record_ids[:10]).execute()
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

        # Global Summary (from settings - simplified extraction)
        settings = user_data.get('settings', {})
        if isinstance(settings, dict):
            global_summary = settings.get('global_insights', {}).get('summary', "")

        # 4. Render Template
        html_content = render_template('emergency_snapshot.html', 
                                     patient={
                                         "name": user_data.get('name', 'Patient'),
                                         "blood_group": user_data.get('blood_group', 'Not Provided'),
                                         "emergency_contact": user_data.get('emergency_contact', 'None')
                                     },
                                     timeline=timeline,
                                     insights=insights,
                                     global_summary=global_summary,
                                     expiry=expires_at.strftime("%Y-%m-%d %H:%M UTC"))
        
        # 5. Save to file
        snapshot_dir = os.path.join(current_app.static_folder, 'emergency')
        os.makedirs(snapshot_dir, exist_ok=True)
        file_path = os.path.join(snapshot_dir, f"{token}.html")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        print(f"DEBUG: Generated snapshot: {file_path}")
        return True, ""
    except Exception as e:
        print(f"DEBUG Error generate_static_snapshot: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, str(e)

@bp.route('/generate-emergency', methods=['POST'])
@require_auth
def generate_emergency():
    """Generates an emergency access token, revokes old ones, and bakes a static snapshot."""
    try:
        supabase = get_supabase_client()
        if not supabase: raise Exception("Supabase client not initialized")
            
        user_id = getattr(request, 'user_id')
        data = request.json or {}
        duration_hours = int(data.get('duration_hours', 24))
        
        # 1. Cleanup old files and revoke existing tokens
        snapshot_dir = os.path.join(current_app.static_folder, 'emergency')
        res = supabase.table('emergency_access').select('token').eq('user_id', user_id).execute()
        for old in (res.data or []):
            try:
                old_path = os.path.join(snapshot_dir, f"{old['token']}.html")
                if os.path.exists(old_path): os.remove(old_path)
            except: pass
            
        supabase.table('emergency_access').delete().eq('user_id', user_id).execute()
        
        # 2. Create a new token
        token = str(uuid.uuid4().hex)
        expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=duration_hours)
        
        # 3. Generate the static HTML snapshot
        success, err_msg = generate_static_snapshot(user_id, token, expires_at)
        if not success:
            raise Exception(f"Failed to generate static medical snapshot: {err_msg}")
            
        # 4. Store the token in DB
        ins_res = supabase.table('emergency_access').insert({
            "user_id": user_id,
            "token": token,
            "expires_at": expires_at.isoformat()
        }).execute()
        
        if not ins_res.data:
            try: os.remove(os.path.join(snapshot_dir, f"{token}.html"))
            except: pass
            raise Exception("Failed to store emergency token.")
            
        
        # 5. Build network URL
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
    """Deletes the current emergency token and removes the static file."""
    try:
        supabase = get_supabase_client()
        if not supabase: return jsonify({"error": "Supabase not configured"}), 500
        
        user_id = getattr(request, 'user_id')
        
        res = supabase.table('emergency_access').select('token').eq('user_id', user_id).execute()
        snapshot_dir = os.path.join(current_app.static_folder, 'emergency')
        for old in (res.data or []):
            try:
                old_path = os.path.join(snapshot_dir, f"{old['token']}.html")
                if os.path.exists(old_path): os.remove(old_path)
            except: pass

        supabase.table('emergency_access').delete().eq('user_id', user_id).execute()
        return jsonify({"message": "Emergency token revoked successfully"}), 200
    except Exception as e:
        print(f"DEBUG Error revoke_emergency: {str(e)}")
        return jsonify({"error": str(e)}), 500

@bp.route('/<token>', methods=['GET'])
def get_emergency_view(token):
    """Serves the static emergency medical dashboard snapshot directly from disk.
    Verifies token validity against the DB to ensure expiry is enforced.
    """
    try:
        # 1. Use service role key to check DB (bypass RLS)
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        service_client = create_client(supabase_url, supabase_service_key)
        
        # 2. Check if token exists and is valid
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        res = service_client.table('emergency_access').select('*').eq('token', token).gt('expires_at', now).maybe_single().execute()
        
        if not res or not res.data:
            # 3. If invalid/expired in DB, delete the file if it exists on disk
            snapshot_dir = os.path.join(current_app.static_folder, 'emergency')
            filename = f"{token}.html"
            file_path = os.path.join(snapshot_dir, filename)
            if os.path.exists(file_path):
                try: os.remove(file_path)
                except: pass
            
            print(f"DEBUG: Emergency access denied for token {token} (Expired or Invalid)")
            return render_template('emergency_error.html', error="This emergency QR code has expired or is no longer valid."), 403

        # 4. If valid, serve from disk
        snapshot_dir = os.path.join(current_app.static_folder, 'emergency')
        filename = f"{token}.html"
        file_path = os.path.join(snapshot_dir, filename)
        
        if not os.path.exists(file_path):
            print(f"DEBUG: Snapshot not found on disk: {file_path}")
            return render_template('emergency_error.html', error="Medical record snapshot not found. Please regenerate."), 404
            
        return send_from_directory(snapshot_dir, filename)
        
    except Exception as e:
        print(f"DEBUG Error get_emergency_view: {str(e)}")
        return render_template('emergency_error.html', error="A system error occurred while verifying the token."), 500
