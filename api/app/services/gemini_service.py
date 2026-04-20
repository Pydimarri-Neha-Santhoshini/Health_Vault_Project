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

    def extract_and_validate(self, file_path_or_uri: str, mime_type: str = "application/pdf") -> Tuple[bool, float, str]:
        """
        Step 1: Extract text and perform LLM validation.
        Returns: (is_valid, validation_score, raw_text)
        """
        try:
            # Upload the file to Gemini via File API (needed for PDFs/Images)
            sample_file = genai.upload_file(path=file_path_or_uri, mime_type=mime_type)
            
            prompt = """
            You are a medical document analyzer. Read this document carefully.
            1. Extract all the raw text from it.
            2. Determine if this document is a valid medical report, prescription, or lab result.
            
            Format your output EXACTLY like this:
            IS_MEDICAL: [YES or NO]
            CONFIDENCE: [0.0 to 1.0]
            TEXT:
            [insert the raw text here]
            """
            
            response = self.model.generate_content([sample_file, prompt])
            
            # Temporary cleanup (good practice for Gemini File API)
            try:
                genai.delete_file(sample_file.name)
            except:
                pass

            response_text = response.text
            
            # Parse output
            lines = response_text.strip().split('\n')
            is_medical_str = ""
            llm_confidence = 0.0
            raw_text = ""
            
            text_started = False
            for line in lines:
                if line.startswith("IS_MEDICAL:"):
                    is_medical_str = line.split(":", 1)[1].strip().upper()
                elif line.startswith("CONFIDENCE:"):
                    try:
                        llm_confidence = float(line.split(":", 1)[1].strip())
                    except:
                        llm_confidence = 0.5
                elif line.startswith("TEXT:"):
                    text_started = True
                elif text_started:
                    raw_text += line + "\n"
                    
            # 1. LLM Score
            llm_score = llm_confidence if is_medical_str == "YES" else 0.0
            
            # 2. Keyword Score
            keyword_score = self._calculate_keyword_score(raw_text)
            
            # 3. Final Validation Score = (0.5 * Keyword Score) + (0.5 * LLM Score)
            validation_score = (0.5 * keyword_score) + (0.5 * llm_score)
            
            # Strict check: LLM MUST say YES and combined score must reach threshold.
            # Using `or` with text-length would accept ANY document — we avoid that.
            is_valid = is_medical_str == "YES" and validation_score >= 0.25
            
            return is_valid, validation_score, raw_text

        except Exception as e:
            print(f"Gemini Extraction Error: {e}")
            return False, 0.0, f"Error: {str(e)}"

    def generate_structured_data(self, raw_text: str) -> Tuple[Dict[str, Any], float]:
        """
        Step 2: Generate structured JSON data from the validated raw text.
        Returns: (structured_dict, final_confidence_score)
        """
        prompt = """
        Extract structured health information from the following medical text.
        Return ONLY a raw JSON object string (do not use Markdown formatting like ```json).
        
        The JSON must strictly follow this structure:
        {
          "Date": "YYYY-MM-DD",
          "Patient Info": {
            "age": null,
            "weight": null, // Use integer number in kg only (e.g. 70). If in lbs, convert to kg. 
            "height": null  // Use number in ft only (e.g. 5.75). If in cm, convert to ft.
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
          "recommendations": "string summary",
          "confidence_score": 0.0
        }
        
        Rules:
        - If a value is not found, use null or an empty string/array as appropriate.
        - IMPORTANT: `Lab Results` values MUST be plain numbers only (e.g., 14.5, not "14.5 g/dL").
        - `Patient Info.weight` MUST be an integer number in KG. If the document has pounds (lb), convert to kg (1 lb = 0.45 kg) and round to the nearest integer.
        - `Patient Info.height` MUST be a number (float) in FT. If the document has cm, convert to ft (1 cm = 0.0328 ft) and round to 2 decimal places.
        - `recommendations` MUST BE a generalized summary of the medical report. **DO NOT include any patient names, doctor names, hospital names, personal information (age, DOB etc) or specific identifiers.** Keep it strictly focused on medical findings and general advice. in (1-2 sentences only be precise).
        - `confidence_score` should reflect your confidence in the extraction (0.0 to 1.0).
        
        Text to analyze:
        """ + raw_text

        try:
            response = self.model.generate_content(prompt)
            output_text = response.text.strip()
            
            # Remove markdown JSON wrappers if Gemini accidentally included them
            if output_text.startswith("```json"):
                output_text = output_text[7:]
            if output_text.startswith("```"):
                output_text = output_text[3:]
            if output_text.endswith("```"):
                output_text = output_text[:-3]
                
            structured_data = json.loads(output_text.strip())
            
            final_confidence = structured_data.get("confidence_score", 0.5)
            
            return structured_data, float(final_confidence)
            
        except Exception as e:
            print(f"Structured Data Extraction Error: {e}")
            return {}, 0.0

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
