def test_security_headers_are_added(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["cross-origin-resource-policy"] == "same-origin"
    assert response.headers["x-request-id"]
    assert response.headers["x-process-time-ms"]


def test_request_id_is_echoed_when_valid(client):
    response = client.get("/health", headers={"X-Request-Id": "test-request-123"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "test-request-123"
