import requests
import json

def test_analyze_endpoint():
    url = "http://localhost:8000/analyze"
    payload = {
        "code": """
def hello():
    print('Hello, World!')
"""
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Response JSON:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {str(e)}")

def test_analyze_repo_endpoint():
    url = "http://localhost:8000/analyze_repo"
    payload = {
        "repo_url": "https://github.com/python/cpython"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        print("This may take some time as it clones and analyzes the repository...")
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Response JSON (showing first few entries):")
            result = response.json()
            # Only show the first 3 entries to avoid overwhelming output
            first_entries = dict(list(result.items())[:3])
            print(json.dumps(first_entries, indent=2))
            print(f"Total files analyzed: {len(result)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Exception: {str(e)}")

if __name__ == "__main__":
    print("Testing /analyze endpoint...")
    test_analyze_endpoint()
    
    print("\nTesting /analyze_repo endpoint...")
    test_analyze_repo_endpoint()