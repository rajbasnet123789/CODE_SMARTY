import os
import subprocess
import tempfile
import re
from fastapi import FastAPI, Request, HTTPException
from huggingface_hub import InferenceClient
import docker
from fastapi.middleware.cors import CORSMiddleware
from git import Repo
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# -----------------------------
# Hugging Face LLM client
# -----------------------------
HF_API_KEY = os.environ.get("HF_API_KEY")
if not HF_API_KEY:
    raise ValueError("HF_API_KEY environment variable not set")

client = InferenceClient(
    model="deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
    token=HF_API_KEY
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["https://your-frontend-domain.com"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SUPPORTED_EXTENSIONS = {
    ".py": "python",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp"
}

# -----------------------------
# Detect language using regex patterns (fallback when LLM is unavailable)
# -----------------------------
def detect_language_with_regex(code: str):
    # Check for Python-specific patterns
    if re.search(r'def\s+\w+\s*\(.*\)\s*:', code) or \
       re.search(r'import\s+\w+', code) or \
       re.search(r'from\s+\w+\s+import', code) or \
       re.search(r'print\s*\(', code):
        return 'python'
    
    # Check for Java-specific patterns
    elif re.search(r'public\s+class\s+\w+', code) or \
         re.search(r'public\s+static\s+void\s+main', code) or \
         re.search(r'System\.out\.println', code) or \
         re.search(r'import\s+java\.', code):
        return 'java'
    
    # Check for C++-specific patterns
    elif re.search(r'#include\s*<(iostream|vector|string|algorithm)>', code) or \
         re.search(r'std::', code) or \
         re.search(r'cout\s*<<', code) or \
         re.search(r'namespace', code) or \
         re.search(r'class\s+\w+\s*\{', code):
        return 'cpp'
    
    # Check for C-specific patterns
    elif re.search(r'#include\s*<(stdio\.h|stdlib\.h|string\.h)>', code) or \
         re.search(r'printf\s*\(', code) or \
         re.search(r'malloc\s*\(', code) or \
         re.search(r'void\s+\w+\s*\(', code):
        return 'c'
    
    # Default to python if we can't determine
    else:
        return 'python'

# -----------------------------
# Detect language using LLM with fallback to regex
# -----------------------------
def detect_language_with_llm(code: str):
    try:
        prompt = f"""
You are a helpful assistant. Detect the programming language of the following code snippet.
Only return one of these: python, java, c, cpp, unknown.
Code:
{code}
"""
        response = client.text_generation(prompt, max_new_tokens=10)
        language = response.strip().lower()
        if language not in ["python", "java", "c", "cpp"]:
            language = "unknown"
        return language
    except Exception as e:
        print(f"Error using LLM for language detection: {e}")
        print("Falling back to regex-based language detection")
        # Fallback to regex-based detection when LLM fails
        return detect_language_with_regex(code)

# -----------------------------
# Helper function to check if a command is available
# -----------------------------
def is_tool_available(name):
    """Check whether a tool is available on the system PATH"""
    try:
        devnull = open(os.devnull, 'w')
        subprocess.Popen([name], stdout=devnull, stderr=devnull).communicate()
        return True
    except OSError:
        return False
    except subprocess.SubprocessError:
        return True  # Some tools return error if called without arguments, but this means they exist

# -----------------------------
# C/C++ conceptual error analysis (Windows-compatible)
# -----------------------------
def run_c_static_analysis(code: str, is_cpp=False):
    results = {}
    
    # Use regex pattern detection for basic conceptual errors
    conceptual_errors = []
    
    # Check for common null pointer issues
    if re.search(r'\w+\s*=\s*NULL\s*;\s*.*\w+\s*->\s*\w+', code) or re.search(r'\w+\s*=\s*NULL\s*;\s*.*\*\w+', code):
        conceptual_errors.append("Potential NULL pointer dereference detected")
        
    # Check for memory leaks (malloc without free)
    if "malloc" in code and "free" not in code:
        conceptual_errors.append("Potential memory leak: malloc used without corresponding free")
        
    # Check for uninitialized variables
    uninit_vars = re.findall(r'(int|float|double|char|long)\s+(\w+)\s*;(?!\s*\2\s*=)', code)
    if uninit_vars:
        var_names = [var[1] for var in uninit_vars]
        conceptual_errors.append(f"Potentially uninitialized variables: {', '.join(var_names)}")
        
    # Check for buffer overflow risks
    if re.search(r'(strcpy|strcat)\s*\(\s*\w+\s*,', code) and not re.search(r'strn(cpy|cat)', code):
        conceptual_errors.append("Potential buffer overflow risk: using strcpy/strcat without bounds checking")
        
    # Check for infinite loops
    if re.search(r'for\s*\(\s*.*;\s*;', code):
        conceptual_errors.append("Potential infinite loop: missing loop condition")
    
    # Check for dangling pointers
    if re.search(r'free\s*\(\s*\w+\s*\)\s*;.*\w+\s*->', code) or re.search(r'free\s*\(\s*\w+\s*\)\s*;.*\*\w+', code):
        conceptual_errors.append("Potential use of dangling pointer after free")
    
    # Check for array out of bounds
    array_decls = re.findall(r'(\w+)\s*\[\s*(\d+)\s*\]', code)
    for array_name, size in array_decls:
        if re.search(rf'{array_name}\s*\[\s*\d+\s*\]', code):
            indices = re.findall(rf'{array_name}\s*\[\s*(\d+)\s*\]', code)
            for idx in indices:
                if idx.isdigit() and int(idx) >= int(size):
                    conceptual_errors.append(f"Potential array out of bounds: {array_name}[{idx}] exceeds size {size}")
    
    if conceptual_errors:
        results["conceptual_errors"] = "\n".join(conceptual_errors)
    else:
        results["conceptual_errors"] = "No conceptual issues detected"
    
    # Check for and run external tools if available
    
    # 1. Run cppcheck for static analysis
    cppcheck_available = is_tool_available("cppcheck")
    if cppcheck_available:
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".c" if not is_cpp else ".cpp", mode="w") as tmp:
                tmp.write(code)
                tmp_path = tmp.name
            
            cmd = ["cppcheck", "--enable=all", "--quiet", tmp_path]
            result = subprocess.run(cmd, capture_output=True, text=True)
            output = result.stderr if result.stderr else "No issues detected by cppcheck"
            results["cppcheck"] = output
            
            # Clean up temp file
            os.unlink(tmp_path)
        except Exception as e:
            results["cppcheck"] = f"Error running cppcheck: {str(e)}"
    else:
        results["cppcheck"] = "Tool not available (cppcheck is not installed or not in PATH)"
    
    # 2. Run clang static analyzer
    clang_analyze_available = is_tool_available("clang" if not is_cpp else "clang++")
    if clang_analyze_available:
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".c" if not is_cpp else ".cpp", mode="w") as tmp:
                tmp.write(code)
                tmp_path = tmp.name
            
            # Use clang's static analyzer warnings
            cmd = ["clang" if not is_cpp else "clang++", "-Weverything", "-fsyntax-only", tmp_path]
            result = subprocess.run(cmd, capture_output=True, text=True)
            output = result.stderr if result.stderr else "No issues detected by clang static analyzer"
            results["clang_analyze"] = output
            
            # Clean up temp file
            os.unlink(tmp_path)
        except Exception as e:
            results["clang_analyze"] = f"Error running clang static analyzer: {str(e)}"
    else:
        results["clang_analyze"] = "Tool not available (clang/clang++ is not installed or not in PATH)"
    
    # 3. Check for memory analysis tools (valgrind)
    valgrind_available = is_tool_available("valgrind")
    if valgrind_available and not os.name == 'nt':  # Valgrind doesn't work on Windows
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".c" if not is_cpp else ".cpp", mode="w") as tmp:
                tmp.write(code)
                tmp_path = tmp.name
            
            # First compile the code
            compile_cmd = ["gcc" if not is_cpp else "g++", "-g", "-o", tmp_path + ".out", tmp_path]
            compile_result = subprocess.run(compile_cmd, capture_output=True, text=True)
            
            if compile_result.returncode == 0:
                # Run valgrind on the compiled binary
                valgrind_cmd = ["valgrind", "--leak-check=full", "--show-leak-kinds=all", tmp_path + ".out"]
                valgrind_result = subprocess.run(valgrind_cmd, capture_output=True, text=True, timeout=5)
                output = valgrind_result.stderr if valgrind_result.stderr else "No memory issues detected"
                results["memory_analysis"] = output
            else:
                results["memory_analysis"] = f"Compilation failed: {compile_result.stderr}"
            
            # Clean up temp files
            os.unlink(tmp_path)
            if os.path.exists(tmp_path + ".out"):
                os.unlink(tmp_path + ".out")
        except Exception as e:
            results["memory_analysis"] = f"Error running valgrind: {str(e)}"
    else:
        if os.name == 'nt':
            results["memory_analysis"] = "Tool not available (valgrind does not work on Windows)"
        else:
            results["memory_analysis"] = "Tool not available (valgrind is not installed or not in PATH)"
    
    return results

# -----------------------------
# Python static analysis
# -----------------------------
def run_static_analysis(code: str):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w") as tmp:
        tmp.write(code)
        tmp_path = tmp.name

    results = {}
    try:
        flake8_output = subprocess.getoutput(f"flake8 {tmp_path}")
        results["flake8"] = flake8_output.strip() if flake8_output else "No issues"
    except Exception as e:
        results["flake8"] = str(e)

    try:
        mypy_output = subprocess.getoutput(f"mypy {tmp_path}")
        results["mypy"] = mypy_output.strip() if mypy_output else "No issues"
    except Exception as e:
        results["mypy"] = str(e)

    os.unlink(tmp_path)
    return results

# -----------------------------
# Docker availability check
# -----------------------------
docker_available = False
try:
    docker.from_env()
    docker_available = True
    print("Docker is available and will be used for code execution")
except Exception as e:
    print(f"Docker is not available: {str(e)}. Using fallback analysis without execution.")

# -----------------------------
# Run code in Docker sandbox with fallback
# -----------------------------
def run_in_docker(code: str, language: str):
    # If Docker is not available, use the fallback analysis
    if not docker_available:
        return run_code_fallback(code, language)
        
    runtime_logs = ""
    try:
        client_docker = docker.from_env()
        with tempfile.TemporaryDirectory() as tmpdir:
            ext_map = {"python": "py", "java": "java", "c": "c", "cpp": "cpp"}
            filename = f"Main.{ext_map.get(language, 'txt')}"
            file_path = os.path.join(tmpdir, filename)
            with open(file_path, "w") as f:
                f.write(code)

            try:
                if language == "python":
                    cmd = f"python {filename}"
                    image = "python:3.11-slim"
                elif language == "java":
                    cmd = f"javac {filename} && java Main"
                    image = "openjdk:20-slim"
                elif language == "c":
                    cmd = f"gcc {filename} -o main && ./main"
                    image = "gcc:latest"
                elif language == "cpp":
                    cmd = f"g++ {filename} -o main && ./main"
                    image = "gcc:latest"
                else:
                    return "Unsupported language"

                container = client_docker.containers.run(
                    image=image,
                    command=cmd,
                    volumes={tmpdir: {"bind": "/app", "mode": "ro"}},
                    working_dir="/app",
                    stderr=True,
                    stdout=True,
                    detach=True,
                    remove=True,
                    mem_limit="512m",
                    network_disabled=True,
                    pids_limit=50
                )
                # Get logs without timeout parameter to avoid type errors
                logs = container.logs()
                runtime_logs = logs.decode("utf-8") if logs else "No output"
            except Exception as e:
                runtime_logs = f"Runtime error: {str(e)}"
    except Exception as e:
        # If Docker fails during execution, use the fallback
        print(f"Docker error during execution: {str(e)}. Using fallback analysis.")
        return run_code_fallback(code, language)
    return runtime_logs

# -----------------------------
# Fallback code analysis (without Docker)
# -----------------------------
def run_code_fallback(code: str, language: str):
    """Provides code analysis without actually executing the code when Docker is not available"""
    result = ""
    
    if language == "python":
        result = "Python code analysis (without execution):\n"
        
        # Check for syntax errors
        try:
            import ast
            ast.parse(code)
            result += "✓ No syntax errors detected\n"
        except SyntaxError as e:
            result += f"✗ Syntax error: {str(e)}\n"
        
        # Check for potential issues
        if "open(" in code and "close(" not in code and "with open" not in code:
            result += "⚠ Warning: File opened but not explicitly closed\n"
        
        if "import os" in code and "os.system" in code:
            result += "⚠ Warning: Potentially unsafe system command execution\n"
            
    elif language in ["c", "cpp"]:
        result = f"{language.upper()} code analysis (without execution):\n"
        
        # Check for common issues
        if re.search(r'\w+\s*=\s*NULL\s*;\s*.*\w+\s*->\s*\w+', code) or re.search(r'\w+\s*=\s*NULL\s*;\s*.*\*\w+', code):
            result += "⚠ Warning: Potential NULL pointer dereference detected\n"
            
        if "malloc" in code and "free" not in code:
            result += "⚠ Warning: Potential memory leak: malloc used without corresponding free\n"
            
        uninit_vars = re.findall(r'(int|float|double|char|long)\s+(\w+)\s*;(?!\s*\2\s*=)', code)
        if uninit_vars:
            var_names = [var[1] for var in uninit_vars]
            result += f"⚠ Warning: Potentially uninitialized variables: {', '.join(var_names)}\n"
            
        if re.search(r'(strcpy|strcat)\s*\(\s*\w+\s*,', code) and not re.search(r'strn(cpy|cat)', code):
            result += "⚠ Warning: Potential buffer overflow risk: using strcpy/strcat without bounds checking\n"
            
        if re.search(r'for\s*\(\s*.*;\s*;', code):
            result += "⚠ Warning: Potential infinite loop: missing loop condition\n"
        
    elif language == "java":
        result = "Java code analysis (without execution):\n"
        
        # Check for common issues
        if ".equals(null)" in code:
            result += "⚠ Warning: Potential NullPointerException: calling .equals() on null\n"
            
        if "new" in code and "= null" in code and re.search(r'\w+\s*=\s*new\s+\w+.*;\s*.*\1\s*=\s*null', code):
            result += "⚠ Warning: Object created and then set to null - possible memory leak\n"
    
    else:
        result = f"Analysis for {language} is not supported in fallback mode"
    
    return result if result else "No issues detected by static analysis"


def ai_fix_agent(code: str, issues: dict, runtime: str, language: str):
    try:
        # Significantly enhanced prompt for conceptual error detection and complexity analysis
        if language in ["c", "cpp"]:
            prompt_template = f"""
            You are an advanced AI code analyzer specializing in detecting conceptual errors and algorithmic complexity issues in {language} code.
            
            Here is the user's code:
            ```{language}
            {code}
            ```
            
            Pattern-based analysis detected these potential issues:
            {issues["conceptual_errors"] if "conceptual_errors" in issues else "No issues detected by pattern analysis"}
            
            Runtime output / errors:
            {runtime}
            
            Please provide an EXPERT-LEVEL comprehensive analysis with:
            
            1. CONCEPTUAL ISSUES:
               - Find and explain logical flaws in the code's design (e.g., infinite loops, off-by-one errors)
               - Detect memory management issues (leaks, double free, null pointer dereference)
               - Identify race conditions or thread safety issues
               - Flag security vulnerabilities (buffer overflows, format string vulnerabilities)
               - Check for undefined behavior
               - Find issues the pattern-based system might have missed
            
            2. ALGORITHMIC COMPLEXITY ANALYSIS:
               - Analyze the time complexity (Big O notation) of algorithms used
               - Analyze the space complexity of the code
               - Identify any inefficient algorithms or data structures
               - Suggest more efficient alternatives with examples
            
            3. SUGGESTED IMPROVEMENTS:
               - Provide optimized code examples that address all issues
               - Explain why your suggested approach is better
               - Include example implementations using best practices
            
            4. BEST PRACTICES EVALUATION:
               - Comment on adherence to {language} best practices
               - Suggest modern {language} features or approaches that could improve the code
            
            Format your response with clear section headings for readability.
            Be specific and provide concrete examples for each issue and recommendation.
            """
        else:
            prompt_template = f"""
            You are an expert AI code analyzer for {language} code.
            
            Here is the user's code:
            ```{language}
            {code}
            ```
            
            Static analysis results:
            {issues}
            
            Runtime output / errors:
            {runtime}
            
            Please provide:
            
            1. CONCEPTUAL ISSUES:
               - Identify logical flaws and design problems
               - Explain potential runtime issues that may not be caught by syntax checks
            
            2. ALGORITHMIC COMPLEXITY ANALYSIS:
               - Analyze the time and space complexity of the code
               - Identify inefficient approaches
               - Suggest algorithmic improvements
            
            3. BEST PRACTICES:
               - Provide guidance on following {language} best practices
               - Suggest modern language features that could improve the code
            
            4. IMPLEMENTATION SUGGESTIONS:
               - Provide optimized code examples
               - Explain why your suggestions are better
            
            Be thorough but concise. Provide code examples where appropriate.
            """

        # Use a larger token limit for more comprehensive analysis
        response = client.text_generation(prompt_template, max_new_tokens=1024)
        return response.strip()
    
    except Exception as e:
        print(f"Error using LLM for code analysis: {e}")
        
        # Generate a fallback response based on pattern detection and static analysis
        fallback_response = "AUTOMATED CODE ANALYSIS (AI service unavailable)\n\n"
        
        # Add conceptual errors if available
        if language in ["c", "cpp"] and "conceptual_errors" in issues and issues["conceptual_errors"] != "No conceptual issues detected":
            fallback_response += "CONCEPTUAL ISSUES:\n"
            fallback_response += issues["conceptual_errors"]
            fallback_response += "\n\n"
        
        # Add runtime issues if available
        if runtime and runtime != "No output" and not "successfully" in runtime:
            fallback_response += "RUNTIME ISSUES:\n"
            fallback_response += runtime
            fallback_response += "\n\n"
        
        # For Python, add static analysis results
        if language == "python":
            if "flake8" in issues and issues["flake8"] != "No issues":
                fallback_response += "STATIC ANALYSIS (flake8):\n"
                fallback_response += issues["flake8"]
                fallback_response += "\n\n"
                
            if "mypy" in issues and issues["mypy"] != "No issues":
                fallback_response += "TYPE CHECKING (mypy):\n"
                fallback_response += issues["mypy"]
                fallback_response += "\n\n"
        
        # Add a general suggestion based on detected issues
        fallback_response += "SUGGESTED IMPROVEMENTS:\n"
        fallback_response += "- Fix any identified conceptual errors\n"
        fallback_response += "- Ensure proper error handling\n"
        fallback_response += "- Follow language best practices\n"
        
        if language in ["c", "cpp"]:
            fallback_response += "- Check for memory leaks\n"
            fallback_response += "- Validate pointer usage\n"
            fallback_response += "- Consider using safer string functions\n"
        
        return fallback_response


@app.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    code = data.get("code", "")

    if not code.strip():
        raise HTTPException(status_code=400, detail="No code provided")

    language = detect_language_with_llm(code)
    if language == "unknown":
        raise HTTPException(status_code=400, detail="Unsupported or undetectable language")

    # Run appropriate static analysis based on language
    issues = {}
    if language == "python":
        issues = run_static_analysis(code)
    elif language in ["c", "cpp"]:
        issues = run_c_static_analysis(code, is_cpp=(language == "cpp"))
    
    runtime_logs = run_in_docker(code, language)
    ai_suggestions = ai_fix_agent(code, issues, runtime_logs, language)

    result = {
        "language": language,
        "issues": issues,
        "runtime": runtime_logs,
        "suggestions": ai_suggestions
    }

    return result

@app.post("/analyze_repo")
async def analyze_repo(request: Request):
    try:
        data = await request.json()
        repo_url = data.get("repo_url", "").strip()
        user_id = data.get("user_id")

        if not repo_url:
            raise HTTPException(status_code=400, detail="No repository URL provided")

        # Make the .git extension optional
        if not repo_url.endswith(".git") and not repo_url.startswith("http"):
            # Try to format as a GitHub URL if it's not a full URL
            if "/" in repo_url:
                repo_url = f"https://github.com/{repo_url}.git"
            else:
                raise HTTPException(status_code=400, detail="Invalid repository URL format")
        elif not repo_url.endswith(".git") and repo_url.startswith("http"):
            repo_url = f"{repo_url}.git"

        results = {}
        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                print(f"⬇️ Cloning {repo_url} into {tmpdir}")
                Repo.clone_from(repo_url, tmpdir)
                print("✅ Clone successful")
            except Exception as e:
                print(f"❌ Clone failed: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Failed to clone repo: {str(e)}")

            for root, dirs, files in os.walk(tmpdir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in SUPPORTED_EXTENSIONS:
                        file_path = os.path.join(root, file)
                        try:
                            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                                code = f.read()

                            language = detect_language_with_llm(code)
                            if language == "unknown":
                                continue

                            # Run appropriate static analysis based on language
                            issues = {}
                            if language == "python":
                                issues = run_static_analysis(code)
                            elif language in ["c", "cpp"]:
                                issues = run_c_static_analysis(code, is_cpp=(language == "cpp"))
                            runtime_logs = run_in_docker(code, language)
                            suggestions = ai_fix_agent(code, issues, runtime_logs, language)

                            rel_path = os.path.relpath(file_path, tmpdir)
                            results[rel_path] = {
                                "language": language,
                                "issues": issues,
                                "runtime": runtime_logs,
                                "suggestions": suggestions
                            }

                        except Exception as e:
                            rel_path = os.path.relpath(file_path, tmpdir)
                            print(f"❌ Failed to process {rel_path}: {str(e)}")
                            results[rel_path] = {"error": str(e)}

        return results
# Use a generic Exception instead of docker.errors.DockerException
    except Exception as e:
        # Check if the error message contains "docker" to provide a more helpful message
        if "docker" in str(e).lower():
            raise HTTPException(status_code=500, detail=f"Docker error: {str(e)}. Make sure Docker is installed and running.")
        else:
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    print("Starting Agentic AI Code Fixer & Repo Analyzer server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)

