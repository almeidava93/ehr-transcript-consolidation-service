from enum import StrEnum
from agents import ModelSettings
from pydantic import BaseModel, ConfigDict, Field, field_validator


class EHRData(BaseModel):
    "General class to store EHR data with unknown structure."

    model_config = ConfigDict(extra="allow")


class TranscriptChunk(BaseModel):
    t: str = Field(pattern="^\d{2}:\d{2}:\d{2}$")
    speaker: str
    text: str


class PredictionRequest(BaseModel):
    session_id: str | None = Field(default=None)
    ehr_data: EHRData
    transcript_chunk: TranscriptChunk


class NotificationType(StrEnum):
    information_missing = "information_missing"
    information_conflict = "information_conflict"


class EditSuggestion(BaseModel):
    """Suggested edit to the EHR data to resolve the error. Should be empty if no edit is suggested. Suggested edit is a dictionary where keys are the field names chained, if necessary, using dot notation and values are the suggested edits."""

    field: str
    value: str


class Notification(BaseModel):
    type: NotificationType = Field(
        description="Type of error detected when comparing EHR data with the transcript chunk."
    )
    message: str = Field(
        description="Description of the error detected when comparing EHR data with the transcript chunk."
    )
    suggested_edit: EditSuggestion | None = Field(
        default=None,
        description="Suggested edit to the EHR data to resolve the error. Should be empty if no edit is suggested.",
    )


class Notifications(BaseModel):
    notifications: list[Notification] = Field(
        default_factory=list,
        description="List of notifications. Should be empty if no errors are detected when comparing EHR data with the transcript chunk.",
    )


class PredictionResponse(Notifications):
    session_id: str


class AgentArgs(BaseModel):
    model: str
    name: str
    instructions: str
    model_settings: ModelSettings
    output_type: type[BaseModel] = Notifications

    @field_validator("model_settings", mode="before")
    def validate_model_settings(cls, value: dict):
        return ModelSettings(**value)


class Config(BaseModel):
    agent_args: AgentArgs
    first_input_prompt_template: str
    input_prompt_template: str
