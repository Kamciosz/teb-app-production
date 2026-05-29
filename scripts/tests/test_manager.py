"""Testy jednostkowe dla TEB-App Manager.
Uruchom: python3 -m pytest scripts/tests/ -v"""
import sys, os, json, tempfile, importlib

# Path setup
SCRIPTS = os.path.expanduser("~/Desktop/teb-app-production/scripts")
sys.path.insert(0, SCRIPTS)

# Load the manager module (without running main)
with open(os.path.join(SCRIPTS, "teb-app-manager.py")) as f:
    code = f.read()
# Remove the main execution part
code = code.split('if __name__ == "__main__"')[0]
exec(code)

def test_infrastructure():
    """Test podstawowej infrastruktury."""
    assert VERSION
    assert COMMANDS_COUNT >= 70
    assert _JSON_MODE is not None
    assert _COLORS is not None

def test_out_function():
    """Test _out() w trybie JSON i tekstowym."""
    global _JSON_MODE
    _JSON_MODE = True
    import io
    from contextlib import redirect_stdout
    f = io.StringIO()
    with redirect_stdout(f):
        _out({"test": 123}, "")
    assert "test" in f.getvalue()
    assert "123" in f.getvalue()
    _JSON_MODE = False

def test_colors():
    """Test funkcji kolorow."""
    assert G("test").startswith("\033") or G("test") == "test"
    assert R("test").endswith("test\033[0m") or R("test") == "test"
    assert D("test")  # dim

def test_session():
    """Test zapisu/odczytu sesji."""
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
        old_file = _SESSION_FILE
        import teb_app_manager  # noqa
    _save_session(test_key="test_value")
    session = _load_session()
    assert session.get("test_key") == "test_value"

def test_api_url():
    """Test poprawnej konfiguracji URL."""
    assert BASE.startswith("https://")
    assert "supabase" in BASE
    assert VERCEL.startswith("https://")
    assert "vercel" in VERCEL
    assert REPO.endswith("teb-app-production")

def test_commands_list():
    """Test czy wszystkie komendy sa zdefiniowane."""
    for cmd in ["health", "users", "stats", "backup", "quick", "analyze", "schema_viz"]:
        fn_name = "cmd_" + cmd
        assert fn_name in globals(), "Missing: " + fn_name

def test_commands_count():
    """Test liczby komend."""
    # Count command function definitions in the manager script
    count = 0
    with open(os.path.join(SCRIPTS, "teb-app-manager.py")) as f:
        for line in f:
            if line.strip().startswith('"') and '":cmd_' in line:
                count += 1
    assert count >= 20, "Zbyt malo: %d" % count

def test_progress_bar():
    """Test progress bara."""
    pb = _PB(10, "Test")
    assert pb.total == 10
    assert pb.i == 0
    pb.tick()
    assert pb.i == 1
    pb.tick("msg")
    assert pb.i == 2
    pb.done()

def test_parallel_api():
    """Test parallel API wywolania (bez sieci)."""
    # Just test the function exists and can be called with empty args
    import concurrent.futures
    assert callable(_parallel)
    # Test with empty list
    result = _parallel([])
    assert isinstance(result, dict)

def test_fetch_retry():
    """Test mechanizmu retry."""
    # The _fetch function should have retries parameter
    import inspect
    sig = inspect.signature(_fetch)
    assert "retries" in sig.parameters
    assert sig.parameters["retries"].default == 2

# removed duplicate
