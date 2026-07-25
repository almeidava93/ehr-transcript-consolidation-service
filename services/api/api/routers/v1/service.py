from typing import Optional
from agents import Agent, Runner, SQLiteSession
import yaml
import uuid

from api.settings import BASE_PATH, TRACES_DB_PATH
from api.routers.v1.schemas import Config, PredictionRequest, PredictionResponse
from api.logs import get_logger

logger = get_logger(__name__)


class PredictionService:
    default_config_version: str = "config_001"

    @classmethod
    def load_config(cls, config_version: Optional[str] = None) -> Config:
        if config_version is None:
            config_version = cls.default_config_version

        config_path = BASE_PATH / "routers" / "v1" / "config" / f"{config_version}.yaml"
        with open(config_path, "r") as f:
            return Config(**yaml.safe_load(f))

    @classmethod
    def make_agent(cls, config: Config) -> Agent:
        model_id = config.agent_args.model
        if model_id.startswith("openai/"):
            agent = Agent(
                **config.agent_args.model_dump(exclude={"model_settings"}),
                model_settings=config.agent_args.model_settings,
            )
            return agent
        else:
            raise ValueError(f"Unsupported model_id: {model_id}")

    @classmethod
    def create_session(cls) -> SQLiteSession:
        session_id = "session_id_" + str(uuid.uuid4())
        return SQLiteSession(session_id, TRACES_DB_PATH)

    @classmethod
    async def predict(
        cls, request: PredictionRequest, config_version: Optional[str] = None
    ) -> PredictionResponse:
        config = cls.load_config(config_version)
        agent = cls.make_agent(config)

        # if this is not the first turn in the session
        if request.session_id is not None:
            session = SQLiteSession(request.session_id, TRACES_DB_PATH)
            input_prompt = config.input_prompt_template.format(
                transcript_chunk=request.transcript_chunk.model_dump(
                    mode="json", exclude_none=True
                )
            )

        # first turn of the session
        else:
            session = cls.create_session()
            input_prompt = config.first_input_prompt_template.format(
                ehr_data=request.ehr_data.model_dump(mode="json", exclude_none=True),
                transcript_chunk=request.transcript_chunk.model_dump(
                    mode="json", exclude_none=True
                ),
            )

        logger.debug(f"Input prompt: {input_prompt}")

        result = await Runner.run(agent, input_prompt, session=session)
        return PredictionResponse(
            session_id=session.session_id, **result.final_output.model_dump()
        )
