from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------- FastAPI app ----------
app = FastAPI()

# ---------- Enable CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # You can replace "*" with ["https://your-frontend-domain.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Request Models ----------
class CodePayload(BaseModel):
    code: str

class RepoPayload(BaseModel):
    repo_url: str

# ---------- Routes ----------
@app.get("/")
def home():
    return {"status": "ok", "message": "CODE-SMARTY backend is running"}

@app.post("/analyze")
def analyze_code(payload: CodePayload):
    # Dummy logic: Replace with your AI/code analysis logic
    code = payload.code
    return {
        "status": "success",
        "analysis": {
            "lines": len(code.splitlines()),
            "characters": len(code),
            "message": "Code analyzed successfully!"
        }
    }

@app.post("/analyze_repo")
def analyze_repo(payload: RepoPayload):
    repo_url = payload.repo_url
    return {
        "status": "success",
        "repo_analysis": {
            "repo_url": repo_url,
            "message": "Repo analyzed successfully!"
        }
    }

# ---------- Run locally ----------
# Use `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
# Render will auto-detect and serve `app`
