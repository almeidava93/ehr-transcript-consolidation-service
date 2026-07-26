import pytest
from api.routers.v1.schemas import EHRData


@pytest.mark.parametrize(
    "text, expected_result",
    [
        ("test", "1: test"),
        ("test\ntest2", "1: test\n2: test2"),
        ("test\n\ntest2", "1: test\n2: \n3: test2"),
    ],
)
def test_ehr_data_from_text(text: str, expected_result: str) -> None:
    assert expected_result == EHRData.from_text(text).text
