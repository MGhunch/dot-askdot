"""
Ask Dot - Backend API
Flask server for Airtable integration and Claude processing
"""

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# ===== CONFIGURATION =====
AIRTABLE_API_KEY = os.environ.get('AIRTABLE_API_KEY')
AIRTABLE_BASE_ID = os.environ.get('AIRTABLE_BASE_ID', 'app8CI7NAZqhQ4G1Y')
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')

AIRTABLE_HEADERS = {
    'Authorization': f'Bearer {AIRTABLE_API_KEY}',
    'Content-Type': 'application/json'
}

# ===== STATIC FILES =====
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# ===== HEALTH CHECK =====
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'ask-dot'})

# ===== CLIENTS =====
@app.route('/api/clients')
def get_clients():
    """Get list of active clients with job counts"""
    try:
        url = f'https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Clients'
        params = {
            'filterByFormula': '{Active}=TRUE()',
            'fields[]': ['Client Name', 'Client Code', 'Active']
        }
        
        response = requests.get(url, headers=AIRTABLE_HEADERS, params=params)
        response.raise_for_status()
        
        clients = []
        for record in response.json().get('records', []):
            fields = record.get('fields', {})
            clients.append({
                'code': fields.get('Client Code', ''),
                'name': fields.get('Client Name', ''),
                'jobCount': 0  # TODO: Count from Projects table
            })
        
        return jsonify(clients)
    
    except Exception as e:
        print(f'Error fetching clients: {e}')
        return jsonify({'error': str(e)}), 500

# ===== JOBS =====
@app.route('/api/jobs')
def get_jobs():
    """Get jobs, optionally filtered by client"""
    client = request.args.get('client')
    
    try:
        url = f'https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Projects'
        
        # Build filter formula
        filters = ["{Status}!='Archived'", "{Status}!='Completed'"]
        if client:
            filters.append(f"{{Client Code}}='{client}'")
        
        formula = f"AND({','.join(filters)})"
        
        params = {
            'filterByFormula': formula,
            'sort[0][field]': 'Update due friendly',
            'sort[0][direction]': 'asc'
        }
        
        response = requests.get(url, headers=AIRTABLE_HEADERS, params=params)
        response.raise_for_status()
        
        jobs = []
        for record in response.json().get('records', []):
            fields = record.get('fields', {})
            jobs.append({
                'id': record.get('id'),
                'number': fields.get('Job Number', ''),
                'name': fields.get('Project Name', ''),
                'client': fields.get('Client Code', ''),
                'stage': fields.get('Stage', ''),
                'status': fields.get('Status', ''),
                'due': fields.get('Update due friendly', 'TBC'),
                'update': fields.get('Update Summary', ''),
                'owner': fields.get('Project Owner', 'TBC'),
                'lastUpdated': fields.get('Last Updated', ''),
                'withClient': fields.get('With Client?', False),
                'channelUrl': fields.get('Channel Url', '')
            })
        
        return jsonify(jobs)
    
    except Exception as e:
        print(f'Error fetching jobs: {e}')
        return jsonify({'error': str(e)}), 500

# ===== SINGLE JOB =====
@app.route('/api/job/<job_number>')
def get_job(job_number):
    """Get a single job by job number"""
    try:
        url = f'https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Projects'
        params = {
            'filterByFormula': f"{{Job Number}}='{job_number}'",
            'maxRecords': 1
        }
        
        response = requests.get(url, headers=AIRTABLE_HEADERS, params=params)
        response.raise_for_status()
        
        records = response.json().get('records', [])
        if not records:
            return jsonify({'error': 'Job not found'}), 404
        
        fields = records[0].get('fields', {})
        return jsonify({
            'id': records[0].get('id'),
            'number': fields.get('Job Number', ''),
            'name': fields.get('Project Name', ''),
            'client': fields.get('Client Code', ''),
            'stage': fields.get('Stage', ''),
            'status': fields.get('Status', ''),
            'due': fields.get('Update due friendly', 'TBC'),
            'update': fields.get('Update Summary', ''),
            'owner': fields.get('Project Owner', 'TBC'),
            'lastUpdated': fields.get('Last Updated', ''),
            'withClient': fields.get('With Client?', False),
            'channelUrl': fields.get('Channel Url', '')
        })
    
    except Exception as e:
        print(f'Error fetching job: {e}')
        return jsonify({'error': str(e)}), 500

# ===== ASK DOT (Claude) =====
@app.route('/api/ask', methods=['POST'])
def ask_dot():
    """
    Natural language query processing via Claude
    Takes a question, returns structured response
    """
    data = request.json
    question = data.get('question', '')
    user_scope = data.get('scope', {})  # Client code, mode, etc.
    
    if not question:
        return jsonify({'error': 'No question provided'}), 400
    
    if not ANTHROPIC_API_KEY:
        return jsonify({'error': 'Anthropic API not configured'}), 500
    
    try:
        # Build context about available data
        # TODO: Fetch actual data summary from Airtable
        
        system_prompt = """You are Dot, a friendly project assistant for Hunch creative agency.
        
Your job is to understand questions about projects and return structured responses.
You speak in a warm, professional tone - helpful but not overly casual.

When asked about WIP, jobs, or projects, identify:
1. The intent (view_wip, view_overdue, get_job_detail, make_update, help)
2. Any client filter mentioned
3. Any specific job number mentioned

Respond in JSON format:
{
    "intent": "view_wip|view_overdue|get_job|make_update|help|unknown",
    "client": "SKY|ONE|TOW|FIS|null",
    "job_number": "SKY 014|null",
    "message": "A friendly response to show the user",
    "needs_clarification": true|false,
    "clarification_options": ["Sky", "One NZ", "Tower"] // if needs_clarification
}
"""

        response = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            json={
                'model': 'claude-sonnet-4-20250514',
                'max_tokens': 500,
                'system': system_prompt,
                'messages': [
                    {'role': 'user', 'content': f"User scope: {user_scope}\n\nQuestion: {question}"}
                ]
            }
        )
        
        response.raise_for_status()
        result = response.json()
        
        # Extract Claude's response
        assistant_message = result.get('content', [{}])[0].get('text', '{}')
        
        # Try to parse as JSON
        import json
        try:
            parsed = json.loads(assistant_message)
            return jsonify(parsed)
        except json.JSONDecodeError:
            # Return raw message if not valid JSON
            return jsonify({
                'intent': 'unknown',
                'message': assistant_message
            })
    
    except Exception as e:
        print(f'Error calling Claude: {e}')
        return jsonify({'error': str(e)}), 500

# ===== PIN AUTH (for future Airtable lookup) =====
@app.route('/api/auth', methods=['POST'])
def authenticate():
    """
    Validate PIN and return user info
    Currently returns mock data - will connect to Airtable
    """
    data = request.json
    pin = data.get('pin', '')
    
    # TODO: Look up PIN in Airtable
    # For now, just validate format
    if len(pin) != 4 or not pin.isdigit():
        return jsonify({'error': 'Invalid PIN format'}), 400
    
    # Mock response - replace with Airtable lookup
    # First digit determines client:
    # 1=One NZ, 2=Sky, 3=Tower, 4=Fisher, 5=Other, 9=Hunch
    prefix = pin[0]
    
    client_map = {
        '1': {'client': 'ONE', 'clientName': 'One NZ', 'mode': 'client'},
        '2': {'client': 'SKY', 'clientName': 'Sky', 'mode': 'client'},
        '3': {'client': 'TOW', 'clientName': 'Tower', 'mode': 'client'},
        '4': {'client': 'FIS', 'clientName': 'Fisher Funds', 'mode': 'client'},
        '5': {'client': 'OTH', 'clientName': 'Other', 'mode': 'client'},
        '9': {'client': 'ALL', 'clientName': 'Hunch', 'mode': 'hunch'}
    }
    
    if prefix not in client_map:
        return jsonify({'error': 'PIN not recognised'}), 401
    
    user_info = client_map[prefix]
    user_info['name'] = 'User'  # Would come from Airtable
    user_info['pin'] = pin
    
    return jsonify(user_info)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
