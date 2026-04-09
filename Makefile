.PHONY: dev-frontend dev-backend dev

dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev:
	make -j2 dev-frontend dev-backend
