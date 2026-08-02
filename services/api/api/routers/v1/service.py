import os
from typing import Optional
from uuid import uuid4

import yaml
from agents import Agent, RunResult, Runner
from agents.extensions.memory.redis_session import RedisSession

from api.logs import get_logger
from api.routers.v1.schemas import Config, PredictionRequest, PredictionResponse
from api.settings import BASE_PATH

logger = get_logger(__name__)


class PredictionService:
    default_config_version = "config_001"
    redis_url = os.environ.get("REDIS_URL")

    @classmethod
    def load_config(cls, config_version: str | None = None) -> Config:
        config_version = config_version or cls.default_config_version

        config_path = BASE_PATH / "routers" / "v1" / "config" / f"{config_version}.yaml"

        with config_path.open(encoding="utf-8") as file:
            return Config(**yaml.safe_load(file))

    @classmethod
    def make_agent(cls, config: Config) -> Agent:
        model_id = config.agent_args.model

        if not model_id.startswith("openai/"):
            raise ValueError(f"Unsupported model_id: {model_id}")

        return Agent(
            **config.agent_args.model_dump(exclude={"model_settings"}),
            model_settings=config.agent_args.model_settings,
        )

    @classmethod
    def create_session(cls) -> RedisSession:
        session_id = f"session_id_{uuid4()}"
        return RedisSession.from_url(session_id, url=cls.redis_url)

    @classmethod
    def resolve_session(cls, session_id: str | None) -> RedisSession:
        """Reuse an existing session or create a new one."""
        if session_id is not None:
            return RedisSession.from_url(session_id, url=cls.redis_url)

        return cls.create_session()

    @classmethod
    async def run_agent(
        cls,
        agent: Agent,
        input_prompt: str,
        session: RedisSession,
    ) -> RunResult:
        """Boundary around the external agent runner."""
        return await Runner.run(
            agent,
            input_prompt,
            session=session,
        )

    @classmethod
    async def predict(
        cls,
        request: PredictionRequest,
        config_version: Optional[str] = None,
    ) -> PredictionResponse:
        config = cls.load_config(config_version)
        agent = cls.make_agent(config)
        session = cls.resolve_session(request.session_id)

        if request.session_id is not None:
            input_prompt = config.input_prompt_template.format(
                transcript_chunk=request.transcript_chunk.model_dump(
                    mode="json",
                    exclude_none=True,
                )
            )
        else:
            input_prompt = config.first_input_prompt_template.format(
                ehr_data=request.ehr_data.model_dump(
                    mode="json",
                    exclude_none=True,
                ),
                transcript_chunk=request.transcript_chunk.model_dump(
                    mode="json",
                    exclude_none=True,
                ),
            )

        logger.debug("Input prompt: %s", input_prompt)

        result = await cls.run_agent(
            agent=agent,
            input_prompt=input_prompt,
            session=session,
        )

        return PredictionResponse(
            session_id=session.session_id,
            **result.final_output.model_dump(),
        )
