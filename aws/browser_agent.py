from strands import Agent
from strands.models import BedrockModel
from strands_tools.browser import AgentCoreBrowser

# Use Amazon Nova (AWS-native) to avoid Anthropic's country/region restrictions.
# Must use the inference profile ID (us.amazon.nova-pro-v1:0), not the raw model ID.
region = "us-west-2"
model_id = "us.amazon.nova-pro-v1:0"

# Initialize the Browser tool
browser_tool = AgentCoreBrowser(region=region)

# Create an agent with the Browser tool and explicit Bedrock model/region
model = BedrockModel(region_name=region, model_id=model_id)
agent = Agent(tools=[browser_tool.browser], model=model)

# Test the agent with a web search prompt
prompt = "what are the services offered by Bedrock AgentCore? Use the documentation link if needed: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html"
print("\n\nPrompt:", prompt, "\n\n")

response = agent(prompt)
print("\n\nAgent Response:")
print(response.message["content"][0]["text"])
