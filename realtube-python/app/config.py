from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 8081
    database_url: str = "postgres://realtube:password@localhost:5432/realtube"
    redis_url: str = "redis://localhost:6379"
    log_level: str = "info"
    environment: str = "development"
    cors_origins: str = "*"

    model_config = {"env_file": ".env"}


settings = Settings()
