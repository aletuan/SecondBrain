from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from brain_api.routes.ingest import router as ingest_router


def create_app() -> FastAPI:
    app = FastAPI(title="Second Brain API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(ingest_router)

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
