"""Pytest configuration for backend tests.

Use a single session-scoped event loop so motor (AsyncIOMotorClient) — which
caches its loop on first IO — works across all async tests in the suite.
"""


def pytest_collection_modifyitems(config, items):
    # Force every async test in this directory to use the session loop scope.
    for item in items:
        for marker in item.iter_markers(name="asyncio"):
            marker.kwargs.setdefault("loop_scope", "session")
