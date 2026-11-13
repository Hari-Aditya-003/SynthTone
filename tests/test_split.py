from app.engines import split_script


def test_sentence_split():
    assert split_script("Hello. World!") == ["Hello.", "World!"]


def test_limit():
    chunks = split_script("hello " * 100, max_chars=30)
    assert all(len(item) <= 30 for item in chunks)
