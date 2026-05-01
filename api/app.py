import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_app():
    app = Flask(__name__, 
                template_folder=os.path.join(os.path.dirname(__file__), 'app', 'templates'),
                static_folder=os.path.join(os.path.dirname(__file__), 'app', 'static'))
    
    # Enable CORS for the React frontend
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Import routes
    from app.routes import records, insights, emergency

    # Register Blueprints
    app.register_blueprint(records.bp, url_prefix='/api/records')
    app.register_blueprint(insights.bp, url_prefix='/api/insights')
    app.register_blueprint(emergency.bp, url_prefix='/api/emergency')

    @app.route('/health')
    def health_check():
        return jsonify({"status": "healthy", "service": "health-vault-api"}), 200

    @app.route('/emergency/<token>')
    def public_emergency_access(token):
        # Delegate to the emergency blueprint logic
        from app.routes import emergency
        return emergency.get_emergency_view(token)

    # Global Error Handlers
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"error": "Bad Request", "message": str(error)}), 400
        
    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({"error": "Unauthorized", "message": str(error)}), 401
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Not Found", "message": str(error)}), 404

    @app.errorhandler(500)
    def internal_error(error):
        # We need to see the real stack trace for debugging
        import traceback
        # Attempt to get original exception if available
        original = getattr(error, 'original_exception', None)
        trace = traceback.format_exc() if original else str(error)
        print(f"Server Error: {trace}")
        return jsonify({"error": "Internal Server Error", "message": str(error), "trace": str(original)}), 500

    return app

# Expose the app object globally so Gunicorn can find it during deployment
app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=int(os.getenv("PORT", 5000)))
