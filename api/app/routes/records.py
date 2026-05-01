from flask import Blueprint, request, jsonify
from app.middleware.auth import require_auth
from app.services.gemini_service import gemini_service
import os
import tempfile
import uuid
import threading

bp = Blueprint('records', __name__)

# NOTE: For production, we would upload to Supabase Storage first,
# then pass the public URL or download locally to send to Gemini.
# Since Gemini File API requires local files, we'll save the uploaded file temporarily.

@bp.route('/upload', methods=['POST'])
@require_auth
def upload_record():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    # Get form data
    title = request.form.get('title', 'Unknown Report')
    record_type = request.form.get('type', 'Lab')
    description = request.form.get('description', '')
    date = request.form.get('date')
    
    # 1. Save file temporarily
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"{str(uuid.uuid4())}_{file.filename}")
    file.save(temp_path)
    
    try:
        # Determine mime type
        mime_type = "application/pdf" if file.filename.lower().endswith(".pdf") else "image/jpeg"
        if file.filename.lower().endswith(".png"):
            mime_type = "image/png"
            
        # 2. Pipeline Step 1 & 2: Validation, Extraction & Structuring
        is_valid, validation_score, structured_data, confidence_score, raw_text_or_error = gemini_service.extract_validate_and_structure(temp_path, mime_type)
        
        if not is_valid:
            os.remove(temp_path)
            if raw_text_or_error.startswith("Error:"):
                err_msg = raw_text_or_error
            else:
                pct = round(validation_score * 100)
                err_msg = (
                    f"This document does not appear to be a valid medical record "
                    f"(AI confidence: {pct}%). Please upload a medical report, "
                    f"lab result, or prescription."
                )
            return jsonify({
                "error": err_msg,
                "validation_score": validation_score
            }), 400
            
        # 3. Storage to Supabase
        # 4. Storage to Supabase
        from supabase import create_client, Client, ClientOptions
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        
        if not supabase_key:
            raise Exception("Supabase Key is required. Please check your .env file.")
            
        auth_header = request.headers.get('Authorization')
        client_options = ClientOptions(headers={'Authorization': auth_header}) if auth_header else None
        
        if client_options:
            supabase: Client = create_client(supabase_url, supabase_key, options=client_options)
        else:
            supabase: Client = create_client(supabase_url, supabase_key)

        user_id = getattr(request, 'user_id')
        
        # We upload the actual file bytes to Supabase Storage Bucket 'health-records'
        # Grouped by user_id for RLS policy alignment
        storage_path = f"{user_id}/{str(uuid.uuid4())}_{file.filename}"
        
        # Read the file bytes again since we already saved it directly to temp
        with open(temp_path, "rb") as f:
            supabase.storage.from_("health-records").upload(
                file=f.read(),
                path=storage_path,
                file_options={"content-type": mime_type}
            )
            
        # Get the public URL for the newly uploaded file
        file_url = supabase.storage.from_("health-records").get_public_url(storage_path)
        
        # 5. Insert Record to DB
        record_data = {
            "user_id": user_id,
            "title": title,
            "type": record_type,
            "description": description,
            "date": date if date else None,
            "file_url": file_url
        }
        rec_res = supabase.table("records").insert(record_data).execute()
        
        if not rec_res.data:
            raise Exception("Failed to insert record into database.")
            
        record_id = rec_res.data[0]['id']
        
        # 6. Insert Insights to DB
        print(f"DEBUG: Structured Data Extracted for Record {record_id}: {structured_data}")
        
        # Try to get recommendations from structured_data, then fallback
        recommendations = structured_data.get('recommendations')
        if not recommendations:
             # Try nested or derived text
             recommendations = "Medical summary extracted. View trends in Insights."
             
        if isinstance(recommendations, list):
            recommendations = " ".join(recommendations)
            
        insights_data = {
            "record_id": record_id,
            "structured_data": structured_data,
            "recommendations": recommendations
        }
        supabase.table("insights").insert(insights_data).execute()
        
        # 7. Refresh Global Summary (Cross-report AI analysis) in the Background
        from app.services.summary_service import update_global_summary_bg
        update_global_summary_bg(user_id, date)

        # Cleanup
        os.remove(temp_path)
        
        return jsonify({
            "message": "Record processed successfully",
            "record_id": record_id,
            "validation_score": validation_score,
            "confidence_score": confidence_score,
            "structured_data": structured_data,
            "global_summary_updated": True
        }), 201

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"error": str(e)}), 500

@bp.route('/', methods=['GET'])
@require_auth
def get_records():
    try:
        from supabase import create_client, Client, ClientOptions
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        
        auth_header = request.headers.get('Authorization')
        client_options = ClientOptions(headers={'Authorization': auth_header}) if auth_header else None
        
        if client_options:
            supabase: Client = create_client(supabase_url, supabase_key, options=client_options)
        else:
            supabase: Client = create_client(supabase_url, supabase_key)
        
        user_id = getattr(request, 'user_id')
        record_type = request.args.get('type')
        
        query = supabase.table('records').select('*').eq('user_id', user_id).order('created_at', desc=True)
        if record_type:
            query = query.eq('type', record_type)
            
        records = query.execute().data
        
        if records:
            # Fetch insights for all these records to pull confidence_score
            record_ids = [r['id'] for r in records]
            insights_res = supabase.table('insights').select('record_id, structured_data').in_('record_id', record_ids).execute()
            
            # Build a map: record_id -> confidence_score
            confidence_map = {}
            for insight in (insights_res.data or []):
                sd = insight.get('structured_data') or {}
                # confidence_score may be at top level of structured_data JSON
                score = sd.get('confidence_score')
                if score is not None:
                    try:
                        confidence_map[insight['record_id']] = round(float(score), 2)
                    except (ValueError, TypeError):
                        confidence_map[insight['record_id']] = None

            # Attach confidence_score to each record
            for record in records:
                record['confidence_score'] = confidence_map.get(record['id'])
        
        return jsonify({"data": records}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route('/<record_id>', methods=['DELETE'])
@require_auth
def delete_record(record_id):
    try:
        from supabase import create_client, Client, ClientOptions
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        
        auth_header = request.headers.get('Authorization')
        client_options = ClientOptions(headers={'Authorization': auth_header}) if auth_header else None
        
        if client_options:
            supabase: Client = create_client(supabase_url, supabase_key, options=client_options)
        else:
            supabase: Client = create_client(supabase_url, supabase_key)
            
        user_id = getattr(request, 'user_id')
        
        # 1. Identify the file URL for storage deletion
        record_res = supabase.table('records').select('file_url').eq('id', record_id).eq('user_id', user_id).execute()
        if not record_res.data:
            return jsonify({"error": "Record not found or unauthorized"}), 404
            
        file_url = record_res.data[0].get('file_url')
        
        # 2. Try to delete the file from storage
        if file_url:
            try:
                # Extract path from URL. e.g. "https://xxx/storage/v1/object/public/health-records/user_id/file.pdf"
                path_parts = file_url.split('/health-records/')
                if len(path_parts) > 1:
                    storage_path = path_parts[1]
                    supabase.storage.from_('health-records').remove([storage_path])
            except Exception as e:
                print(f"DEBUG: Failed to delete file from storage: {e}")
                
        # 3. Delete the record from DB (this cascades to insights)
        del_res = supabase.table('records').delete().eq('id', record_id).eq('user_id', user_id).execute()
        
        # 4. Trigger global summary update to reflect deletion
        from app.services.summary_service import update_global_summary_bg
        update_global_summary_bg(user_id)

        return jsonify({"message": "Record deleted successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
