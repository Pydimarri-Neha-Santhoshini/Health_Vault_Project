import os
import json
import google.generativeai as genai
from typing import Dict, Any, Tuple
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini AI
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    
# We use the currently active and available model
MODEL_NAME = "models/gemini-2.5-flash"

class GeminiService:
    def __init__(self):
        self.model = genai.GenerativeModel(MODEL_NAME)
        # Keywords for validation scoring
        self.keywords = [
            'hemoglobin', 'prescription', 'diagnosis', 'doctor', 
            'patient', 'lab result', 'blood test', 'medication', 'dose',
            'hospital', 'clinic', 'wbc', 'rbc', 'platelets', 'report'
        ]

    def _calculate_keyword_score(self, text: str) -> float:
        """Calculate the frequency of medical keywords in the raw text."""
        text_lower = text.lower()
        matches = sum(1 for keyword in self.keywords if keyword in text_lower)
        # Normalize: if we find 3 or more keywords, we give a full 1.0 score
        return min(matches / 3.0, 1.0)

    def extract_validate_and_structure(self, file_path_or_uri: str, mime_type: str = "application/pdf") -> Tuple[bool, float, Dict[str, Any], float, str]:
        """
        Step 1 & 2 Combined: Validate the document and directly extract structured JSON data.
        Returns: (is_valid, validation_score, structured_dict, final_confidence_score, raw_text_or_error)
        """
        try:
            sample_file = genai.upload_file(path=file_path_or_uri, mime_type=mime_type)
            
            prompt = """
            You are a medical document analyzer. Read this document carefully.
            1. Determine if this document is a valid medical report, prescription, or lab result.
            2. If YES, extract structured health information from it.
            
            Format your output EXACTLY as a raw JSON object string (do not use Markdown formatting like ```json).
            
            The JSON MUST strictly follow this structure:
            {
              "is_medical": true,
              "Date": "YYYY-MM-DD",
              "Patient Info": {
                "age": null,
                "weight": null, // integer number in kg only (convert lbs to kg -> 1 lb = 0.45 kg)
                "height": null  // number in ft only (convert cm to ft -> 1 cm = 0.0328 ft)
              },
              "Medications": [
                { "name": "", "dosage": "" }
              ],
              "Lab Results": {
                "Hemoglobin": null,
                "WBC": null,
                "RBC": null,
                "Platelets": null,
                "Vitamin D": null,
                "Vitamin B12": null
              },
              "recommendations": "Provide a precise, easy-to-understand summary of THIS specific record in at most 1 to 2 lines. DO NOT include any personal information like 'this patient', age, or demographics, as all records belong to the same person.",
              "confidence_score": 0.0
            }

            If the document is NOT a valid medical report, just return:
            {
              "is_medical": false,
              "confidence_score": 0.0
            }
            """
            
            response = self.model.generate_content([sample_file, prompt])
            
            try:
                genai.delete_file(sample_file.name)
            except:
                pass

            output_text = response.text.strip()
            
            # Remove markdown JSON wrappers if present
            if output_text.startswith("```json"):
                output_text = output_text[7:]
            if output_text.startswith("```"):
                output_text = output_text[3:]
            if output_text.endswith("```"):
                output_text = output_text[:-3]
                
            structured_data = json.loads(output_text.strip())
            
            is_valid = structured_data.get("is_medical", False)
            final_confidence = float(structured_data.get("confidence_score", 0.0))
            
            # To preserve UI errors based on threshold, we just return the AI's confidence
            # If the AI says it's medical and confidence >= 0.25, it's valid.
            validation_score = final_confidence
            if is_valid and validation_score >= 0.25:
                # Remove internal flag from data before saving
                if "is_medical" in structured_data:
                    del structured_data["is_medical"]
                return True, validation_score, structured_data, final_confidence, ""
            else:
                return False, validation_score, {}, final_confidence, "This document does not appear to be a valid medical record."

        except Exception as e:
            print(f"Gemini Combined Extraction Error: {e}")
            return False, 0.0, {}, 0.0, f"Error: {str(e)}"

    def generate_global_summary(self, all_structured_data: list) -> str:
        """
        Step 3: Generate a consolidated global health summary from multiple records.
        Returns: A markdown-formatted summary string.
        """
        if not all_structured_data:
            return ""

        prompt = f"""
        You are a senior medical analyst. Review the following consolidated medical data points extracted from multiple reports over time.
        
        Data:
        {json.dumps(all_structured_data, indent=2)}
        
        Task:
        1. Identify trends in key metrics (Hemoglobin, WBC, etc.).
        2. Identify any recurring medications.
        3. Provide a concise, professional health summary (2-3 sentences total).
        4. Provide 3 actionable, bulleted "Health Recommendations" based strictly on these trends. (short points)
        5. **DO NOT include any patient names, doctor names, hospital names, personal information (age, DOB etc) or specific identifiers.** Keep it strictly focused on medical findings and general advice.

        Your response must be a single block of text starting with the summary. Do not include JSON.
        """

        try:
            response = self.model.generate_content(prompt)
            return response.text.strip() or "Analysis complete. Trends have been mapped."
        except Exception as e:
            print(f"Global Summary Generation Error: {e}")
            return "Analysis complete. View metrics below."

gemini_service = GeminiService()
