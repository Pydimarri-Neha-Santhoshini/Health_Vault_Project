import os
import threading
from app.services.gemini_service import gemini_service
from supabase import create_client

def update_global_summary_bg(user_id, date=None):
    """
    Trigger a background thread to regenerate the global summary for a user.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    # MUST use service role key — anon key is blocked by RLS in background threads
    supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_service_key:
        print("DEBUG BG: Supabase credentials missing, cannot update global summary.")
        return

    def run_update():
        # We removed the 60-second delay. Gemini 1.5 Flash allows 15 RPM on the free tier.
        # A single upload + summary generation takes 2 RPM, so we are well within limits.
        print(f"DEBUG BG: Starting global summary generation...")
        
        try:
            supabase_bg = create_client(supabase_url, supabase_service_key)
            
            # 1. Fetch all records for the user
            all_records_res = supabase_bg.table("records").select("id").eq("user_id", user_id).execute()
            all_record_ids = [r['id'] for r in all_records_res.data]
            
            if not all_record_ids:
                print(f"DEBUG BG: No records found for user {user_id}, clearing global summary.")
                # If no records left, clear the global insights
                current_user_res = supabase_bg.table("users").select("settings").eq("id", user_id).execute()
                settings = (current_user_res.data[0].get('settings') or {}) if current_user_res.data else {}
                if 'global_insights' in settings:
                    del settings['global_insights']
                    supabase_bg.table("users").update({"settings": settings}).eq("id", user_id).execute()
                return
            
            # 2. Fetch all insights for these records
            all_insights_res = supabase_bg.table("insights").select("structured_data").in_("record_id", all_record_ids).execute()
            all_structs = [i['structured_data'] for i in all_insights_res.data if i.get('structured_data')]
            
            if not all_structs:
                print(f"DEBUG BG: No structured data found for user {user_id}, skipping.")
                return
                
            print(f"DEBUG BG: Generating global summary for user {user_id} from {len(all_structs)} records...")
            global_summary = gemini_service.generate_global_summary(all_structs)
            
            if not global_summary:
                print("DEBUG BG: Gemini returned empty global summary.")
                return
            
            # 3. Save to user settings
            current_user_res = supabase_bg.table("users").select("settings").eq("id", user_id).execute()
            settings = (current_user_res.data[0].get('settings') or {}) if current_user_res.data else {}
            settings['global_insights'] = {
                "summary": global_summary,
                "updated_at": date if date else "Recently"
            }
            update_res = supabase_bg.table("users").update({"settings": settings}).eq("id", user_id).execute()
            print(f"DEBUG BG: Global summary saved for user {user_id}. Rows updated: {len(update_res.data)}")
            
        except Exception as ge:
            print(f"DEBUG BG: Failed to update global summary for user {user_id}: {ge}")
            import traceback
            traceback.print_exc()

    t = threading.Thread(target=run_update)
    t.daemon = True
    t.start()
