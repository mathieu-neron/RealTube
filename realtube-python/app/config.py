from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 8081
    database_url: str = ""
    redis_url: str = ""
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    log_level: str = "info"
    environment: str = "development"
    cors_origins: str = "*"

    postgres_user: str = "realtube"
    postgres_password: str = "password"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "realtube"
    postgres_sslmode: str = "prefer"

    model_config = {"env_file": ".env"}

    @staticmethod
    def _read_secret(secret_name: str, fallback: str) -> str:
        secret_path = Path(f"/run/secrets/{secret_name}")
        if secret_path.is_file():
            return secret_path.read_text().strip()
        return fallback

    def model_post_init(self, __context: object) -> None:
        if not self.database_url:
            password = self._read_secret("postgres_password", self.postgres_password)
            self.database_url = (
                f"postgres://{self.postgres_user}:{password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
                f"?sslmode={self.postgres_sslmode}"
            )

        if not self.redis_url:
            redis_pw = self._read_secret("redis_password", self.redis_password)
            if redis_pw:
                self.redis_url = f"redis://:{redis_pw}@{self.redis_host}:{self.redis_port}"
            else:
                self.redis_url = f"redis://{self.redis_host}:{self.redis_port}"


settings = Settings()
