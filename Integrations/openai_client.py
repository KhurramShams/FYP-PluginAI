import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from openai import AsyncOpenAI
load_dotenv(override=True)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ✅ Embedding model
embedding_model = OpenAIEmbeddings(
    model="text-embedding-3-small",
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

# ✅ Chat model (LLM)
llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.7,
    openai_api_key=os.getenv("OPENAI_API_KEY")
)