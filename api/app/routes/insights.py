from flask import Blueprint, jsonify, request
from app.middleware.auth import require_auth
from supabase import create_client, Client
import os

bp = Blueprint('insights', __name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

@bp.route('/', methods=['GET'])
@require_auth
def get_insights():
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
        
        # Fetch user's records to get the titles and dates
        records_res = supabase.table('records').select('id, title, date, created_at').eq('user_id', user_id).execute()
        records_data = records_res.data
        if not records_data:
            return jsonify({"data": {"chart_data": [], "recommendations": []}}), 200
            
        record_info = {r['id']: {"title": r['title'], "date": r.get('date') or r.get('created_at').split('T')[0]} for r in records_data}
        record_ids = list(record_info.keys())
        
        # Fetch insights for those records
        insights_res = supabase.table('insights').select('*').in_('record_id', record_ids).execute()
        insights_data = insights_res.data
        
        chart_data = []
        recommendations = []
        import json
        import re
        
        def parse_numeric(val):
            if val is None: return None
            val_str = str(val).lower().replace(',', '')
            # Extract first number
            match = re.search(r"[-+]?\d*\.\d+|\d+", val_str)
            if match:
                return float(match.group())
            return None

        def convert_weight(val):
            if val is None: return None
            num = parse_numeric(val)
            if num is None: return None
            
            val_str = str(val).lower()
            if 'lb' in val_str or 'pound' in val_str:
                return int(round(num * 0.453592))
            return int(round(num)) # Assume kg, return as integer

        def convert_height(val):
            if val is None: return None
            val_str = str(val).lower()
            
            # Handle ft/in format like 5'8" or 5ft 8in
            ft_match = re.search(r"(\d+)\s*(?:'|ft|feet)", val_str)
            in_match = re.search(r"(\d+)\s*(?:\"|in|inches)", val_str)
            
            if ft_match:
                feet = float(ft_match.group(1))
                inches = float(in_match.group(1)) if in_match else 0
                return round(feet + (inches / 12.0), 2)
            
            num = parse_numeric(val)
            if num is None: return None
            
            # If large number, assume cm
            if num > 30: # Likely cm
                return round(num * 0.0328084, 2)
            return round(num, 2) # Already in ft?

        for ins in insights_data:
            rec_id = ins['record_id']
            info = record_info.get(rec_id, {"title": "Unknown Report", "date": "Unknown Date"})
            
            struct_raw = ins.get('structured_data', {})
            struct = {}
            if isinstance(struct_raw, str):
                try:
                    struct = json.loads(struct_raw)
                except Exception:
                    pass
            elif isinstance(struct_raw, dict):
                struct = struct_raw
            
            # Initialize entry with date from record
            chart_entry = {"date": info["date"]}
            
            # 1. Extract Lab Results
            labs = struct.get("Lab Results") or struct.get("lab_results") or struct.get("Lab_Results") or struct.get("lab results") or {}
            if isinstance(labs, list):
                labs_dict = {}
                for item in labs:
                    if isinstance(item, dict):
                        k = item.get("name") or item.get("test")
                        v = item.get("value") or item.get("result")
                        if k and v is not None:
                            labs_dict[k] = v
                labs = labs_dict

            if labs and isinstance(labs, dict):
                normalized_labs = {str(k).strip().title(): v for k, v in labs.items()}
                key_map = {
                    "Hemoglobin": ["Hemoglobin", "Hb", "Hgb", "Haemoglobin"],
                    "WBC": ["Wbc", "White Blood Cells", "Wbc Count", "Leukocytes"],
                    "RBC": ["Rbc", "Red Blood Cells", "Erythrocytes"],
                    "Platelets": ["Platelets", "Plt", "Platelet Count"]
                }

                for target_key, aliases in key_map.items():
                    val = None
                    for alias in aliases:
                        val = normalized_labs.get(alias.title())
                        if val is not None: break
                    
                    if val is not None:
                        num = parse_numeric(val)
                        if num is not None:
                            chart_entry[target_key] = num
            
            # 2. Extract Patient Info (Weight/Height)
            patient_info = struct.get("Patient Info") or struct.get("patient_info") or struct.get("Patient_Info") or {}
            if patient_info:
                weight_raw = patient_info.get("weight") or patient_info.get("Weight")
                height_raw = patient_info.get("height") or patient_info.get("Height")
                
                weight_kg = convert_weight(weight_raw)
                height_ft = convert_height(height_raw)
                
                if weight_kg is not None:
                    chart_entry["Weight"] = weight_kg
                if height_ft is not None:
                    chart_entry["Height"] = height_ft

            if len(chart_entry) > 1:
                chart_data.append(chart_entry)
            
            # 3. Extract Recommendation
            recs = ins.get('recommendations')
            if not recs or recs in ["AI Analysis Complete", "Analysis complete", ""]:
                recs = struct.get('recommendations') or struct.get('Recommendations') or recs
            
            if isinstance(recs, list):
                processed_recs = []
                for r in recs:
                    if isinstance(r, str): processed_recs.append(r)
                    elif isinstance(r, dict): processed_recs.append(r.get("text") or r.get("recommendation") or str(r))
                recs = " ".join(processed_recs) if processed_recs else recs
            elif isinstance(recs, dict):
                recs = recs.get("text") or recs.get("recommendation") or str(recs)

            if recs and isinstance(recs, str) and recs.strip():
                recommendations.append({
                    "text": recs,
                    "report_title": info["title"],
                    "date": info["date"]
                })

        # Fetch Global Summary from users table
        # Use service role key to read users.settings without RLS restrictions
        supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or supabase_key
        service_client = create_client(supabase_url, supabase_service_key)
        user_res = service_client.table('users').select('settings').eq('id', user_id).execute()
        user_settings = (user_res.data[0].get('settings') or {}) if user_res.data else {}
        global_summary_data = user_settings.get('global_insights', {})
        
        # On-demand fallback: if no summary saved yet but we have chart data, generate it now
        if (not global_summary_data or not global_summary_data.get('summary')) and chart_data:
            try:
                from app.services.gemini_service import gemini_service
                # Collect all structured data
                all_insights_res = supabase.table('insights').select('structured_data').in_('record_id', record_ids).execute()
                all_structs = [i['structured_data'] for i in (all_insights_res.data or []) if i.get('structured_data')]
                if all_structs:
                    print(f"DEBUG: On-demand global summary generation for {len(all_structs)} records...")
                    generated = gemini_service.generate_global_summary(all_structs)
                    if generated:
                        global_summary_data = {
                            "summary": generated,
                            "updated_at": records_data[0].get('date', 'Recently') if records_data else 'Recently'
                        }
                        # Persist to DB for next time
                        settings = dict(user_settings)
                        settings['global_insights'] = global_summary_data
                        service_client.table('users').update({"settings": settings}).eq('id', user_id).execute()
                        print("DEBUG: On-demand global summary saved.")
            except Exception as on_demand_err:
                print(f"DEBUG: On-demand summary generation failed: {on_demand_err}")

        chart_data.sort(key=lambda x: x['date'])
        
        return jsonify({
            "data": {
                "chart_data": chart_data,
                "recommendations": recommendations,
                "global_summary": global_summary_data
            }
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
