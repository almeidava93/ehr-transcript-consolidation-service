import json
import uuid
from pathlib import Path
import jsonlines
import requests
from tqdm import tqdm
import logging

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

ehr_data_path = Path("data/medical-record.json")
transcript_path = Path("data/transcript.json")
output_path = Path("output")

output_path.mkdir(exist_ok=True)

with open(ehr_data_path, "r") as f:
    ehr_data = json.loads(f.read())

with open(transcript_path, "r") as f:
    transcript = json.loads(f.read())


def send_request(ehr_data, transcript_chunk):
    url = "http://localhost:8080/v1/predict"
    data = {"ehr_data": ehr_data, "transcript_chunk": transcript_chunk}
    response = requests.post(url, json=data)
    return response


def main():
    simulation_id = "simulation_id_" + str(uuid.uuid4())
    output_file_path = output_path / f"{simulation_id}.jsonl"
    output_file_path.touch()

    logger.info(f"Simulation ID: {simulation_id}")
    for transcript_chunk in tqdm(
        transcript["segments"], desc="Validating EHR with transcript segments"
    ):
        response = send_request(ehr_data, transcript_chunk)

        with jsonlines.open(output_file_path, mode="a") as writer:
            writer.write(
                {
                    "transcript_chunk": transcript_chunk,
                    "response": response.json(),
                }
            )


if __name__ == "__main__":
    main()
