import os
from functools import wraps
from flask import request, jsonify
from supabase import create_client, Client
import jwt
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET") # Obtainable from Supabase API settings

# Initialize Supabase Admin client for backend operations
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split(' ')[1]
        try:
            # We can verify via Supabase JWT Secret if provided, or pass the token to the Supabase client
            if JWT_SECRET:
                decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], audience="authenticated")
                request.user_id = decoded.get('sub')
            else:
                # Fallback: Let Supabase `getUser` validate the JWT by creating a scoped client
                # This is a bit slower but works without knowing the JWT secret directly
                user_res = supabase.auth.get_user(token)
                if not user_res or not user_res.user:
                    raise Exception("Invalid session")
                request.user_id = user_res.user.id
                
        except Exception as e:
            return jsonify({"error": "Invalid token", "details": str(e)}), 401
            
        return f(*args, **kwargs)
    return decorated
