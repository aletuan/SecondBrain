import json

from brain_api.progress import format_line, try_parse_line


def test_roundtrip_phase() -> None:
    ev = {"v": 1, "kind": "phase", "phase": "fetch", "state": "active"}
    line = format_line(ev)
    assert try_parse_line(line) == ev


def test_roundtrip_done() -> None:
    ev = {
        "v": 1,
        "kind": "done",
        "captureDir": "/tmp/Captures/x",
        "captureId": "x",
    }
    line = format_line(ev)
    assert try_parse_line(line) == ev


def test_roundtrip_error_with_phase() -> None:
    ev = {"v": 1, "kind": "error", "message": "boom", "phase": "fetch"}
    line = format_line(ev)
    assert try_parse_line(line) == ev


def test_roundtrip_error_without_phase() -> None:
    ev = {"v": 1, "kind": "error", "message": "boom"}
    line = format_line(ev)
    parsed = try_parse_line(line)
    assert parsed == ev
    assert "phase" not in parsed


def test_parse_phase_whitespace_and_crlf() -> None:
    assert try_parse_line('{"v":1,"kind":"phase","phase":"fetch","state":"active"}\r') == {
        "v": 1,
        "kind": "phase",
        "phase": "fetch",
        "state": "active",
    }
    assert try_parse_line('  {"v":1,"kind":"phase","phase":"vault","state":"done"}  ') == {
        "v": 1,
        "kind": "phase",
        "phase": "vault",
        "state": "done",
    }


def test_parse_done_and_error() -> None:
    assert try_parse_line(
        '{"v":1,"kind":"done","captureDir":"/tmp/Captures/x","captureId":"x"}',
    ) == {
        "v": 1,
        "kind": "done",
        "captureDir": "/tmp/Captures/x",
        "captureId": "x",
    }
    assert try_parse_line('{"v":1,"kind":"error","message":"boom","phase":"fetch"}') == {
        "v": 1,
        "kind": "error",
        "message": "boom",
        "phase": "fetch",
    }
    assert try_parse_line('{"v":1,"kind":"error","message":"only msg"}') == {
        "v": 1,
        "kind": "error",
        "message": "only msg",
    }


def test_reject_wrong_v() -> None:
    assert try_parse_line('{"v":2}') is None
    assert try_parse_line('{"v":1,"kind":"phase","phase":"fetch","state":"active"}') is not None


def test_reject_invalid_phase_or_state() -> None:
    assert try_parse_line('{"v":1,"kind":"phase","phase":"nope","state":"active"}') is None
    assert try_parse_line('{"v":1,"kind":"phase","phase":"fetch","state":"maybe"}') is None


def test_reject_non_object_and_bad_kinds() -> None:
    assert try_parse_line("not json") is None
    assert try_parse_line('{"v":1,"kind":"done","captureDir":1,"captureId":"x"}') is None
    assert try_parse_line('{"v":1,"kind":"unknown"}') is None


def test_reject_error_bad_phase() -> None:
    assert (
        try_parse_line('{"v":1,"kind":"error","message":"m","phase":"nope"}') is None
    )


def test_multiline_buffer_edge_cases() -> None:
    # trim → empty → not an object line
    assert try_parse_line("") is None
    assert try_parse_line("   \n  ") is None
    # does not start with { after trim
    assert try_parse_line('  "v":1  ') is None
    # two JSON objects in one string: JSON.parse fails (mirrors TS)
    double = '{"v":1,"kind":"error","message":"a"}\n{"v":1,"kind":"error","message":"b"}'
    assert try_parse_line(double) is None
    # valid line with trailing newline in buffer-style input: trim strips outer WS only
    assert try_parse_line('{"v":1,"kind":"error","message":"x"}\n') == {
        "v": 1,
        "kind": "error",
        "message": "x",
    }
    # escaped newline inside JSON string value is valid
    assert try_parse_line(r'{"v":1,"kind":"error","message":"a\nb"}') == {
        "v": 1,
        "kind": "error",
        "message": "a\nb",
    }
    # invalid / truncated JSON (whitespace between tokens is allowed by JSON.parse)
    assert try_parse_line('{"v":1,"kind":"phase","phase":"fetch"') is None


def test_format_line_is_json_plus_newline() -> None:
    line = format_line({"v": 1, "kind": "phase", "phase": "llm", "state": "done"})
    assert line.endswith("\n")
    assert "\n" not in line[:-1]
    obj = json.loads(line.strip())
    assert obj == {"v": 1, "kind": "phase", "phase": "llm", "state": "done"}
