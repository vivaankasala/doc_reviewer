import os
from dotenv import load_dotenv

load_dotenv()

# Use OpenRouter (openrouter.ai) or OpenAI directly
USE_OPENROUTER = os.getenv("USE_OPENROUTER", "true").lower() in ("true", "1", "yes")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("OPENROUTER_API_KEY")
# OpenRouter model IDs need org prefix (e.g. openai/gpt-4o-mini)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "openai/gpt-4o-mini" if USE_OPENROUTER else "gpt-4o-mini")
