def test_readiness_returns_system_status(client):
    response = client.get("/api/system/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["services"]
