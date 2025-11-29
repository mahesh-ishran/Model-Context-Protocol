// server.js - Web server as MCP host, using OpenAI ChatGPT
const express = require('express');
const OpenAI = require('openai');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
require('dotenv').config();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MCP Clients
let mcpFilesystemClient = null;
let mcpCalculatorClient = null;
let availableTools = [];

// Initialize MCP connections
async function initializeMCP() {
  try {
    console.log('🔌 Initializing MCP connections...');
    
    // Create data directory for testing
    const fs = require('fs');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
      fs.writeFileSync(
        path.join(dataDir, 'sample.txt'),
        'Hello from MCP! This is a test file.\nMCP allows AI to access this data securely.'
      );
      fs.writeFileSync(
        path.join(dataDir, 'notes.txt'),
        'Project Notes:\n- Implement user authentication\n- Add database integration\n- Deploy to production'
      );
      fs.writeFileSync(
        path.join(dataDir, 'todo.txt'),
        'Today\'s Tasks:\n1. Review MCP integration\n2. Test OpenAI API\n3. Deploy application'
      );
    }
    
    // Connect to filesystem MCP server
    mcpFilesystemClient = new Client(
      {
        name: 'mcp-web-client-fs',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    const fsTransport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', dataDir],
    });

    await mcpFilesystemClient.connect(fsTransport);
    console.log('✅ Connected to Filesystem MCP Server');

    // Connect to calculator MCP server
    mcpCalculatorClient = new Client(
      {
        name: 'mcp-web-client-calc',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    const calcTransport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    });

    await mcpCalculatorClient.connect(calcTransport);
    console.log('✅ Connected to Calculator MCP Server');

    // Get available tools
    const fsTools = await mcpFilesystemClient.listTools();
    const calcTools = await mcpCalculatorClient.listTools();
    
    availableTools = [
      ...fsTools.tools.map(tool => ({ ...tool, server: 'filesystem' })),
      ...calcTools.tools.map(tool => ({ ...tool, server: 'calculator' })),
    ];

    console.log('📦 Available MCP Tools:', availableTools.map(t => t.name).join(', '));
    console.log('✨ MCP initialization complete!\n');
    
  } catch (error) {
    console.error('❌ MCP initialization failed:', error);
    throw error;
  }
}

// Convert MCP tools to OpenAI function format
// OpenAI uses standard JSON Schema - same as MCP! This is the easiest conversion.
function convertMCPToolsToOpenAI(mcpTools) {
  return mcpTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || `Tool: ${tool.name}`,
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  }));
}

// Execute MCP tool
async function executeMCPTool(toolName, toolInput) {
  const tool = availableTools.find(t => t.name === toolName);
  
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  let client;
  if (tool.server === 'filesystem') {
    client = mcpFilesystemClient;
  } else if (tool.server === 'calculator') {
    client = mcpCalculatorClient;
  }

  const result = await client.callTool({
    name: toolName,
    arguments: toolInput,
  });

  return result;
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    console.log(`\n💬 User: ${message}`);

    // Convert MCP tools to OpenAI format
    const openaiTools = convertMCPToolsToOpenAI(availableTools);

    // Build messages array for OpenAI
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Call OpenAI with tools
    let response = await openai.chat.completions.create({
      model: 'gpt-4o', // or 'gpt-4-turbo', 'gpt-3.5-turbo'
      messages: messages,
      tools: openaiTools,
      tool_choice: 'auto',
    });

    console.log('🤖 ChatGPT response received');

    // Handle tool calls (agentic loop)
    let maxIterations = 5;
    let iterations = 0;

    while (iterations < maxIterations && response.choices[0].finish_reason === 'tool_calls') {
      const toolCalls = response.choices[0].message.tool_calls;
      
      if (!toolCalls || toolCalls.length === 0) {
        break;
      }

      console.log(`🔧 Tool calls detected: ${toolCalls.length}`);

      // Add assistant's message with tool calls
      messages.push(response.choices[0].message);

      // Execute all tool calls
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🔧 Calling: ${functionName}`);
        console.log(`📥 Args:`, JSON.stringify(functionArgs, null, 2));

        try {
          const toolResult = await executeMCPTool(functionName, functionArgs);

          console.log(`📤 Result:`, JSON.stringify(toolResult.content, null, 2));

          // Format response for OpenAI
          const responseContent = Array.isArray(toolResult.content)
            ? toolResult.content.map(c => c.text || JSON.stringify(c)).join('\n')
            : typeof toolResult.content === 'string'
            ? toolResult.content
            : JSON.stringify(toolResult.content);

          // Add tool response
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: responseContent,
          });
        } catch (error) {
          console.error(`❌ Error executing ${functionName}:`, error);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message }),
          });
        }
      }

      // Get next response from OpenAI
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        tools: openaiTools,
        tool_choice: 'auto',
      });

      console.log('🤖 ChatGPT response received');
      iterations++;
    }

    // Get final text response
    const finalMessage = response.choices[0].message;
    const finalText = finalMessage.content || 'I apologize, but I could not generate a response.';

    console.log(`💬 Assistant: ${finalText}\n`);

    // Update conversation history
    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: finalText },
    ];

    res.json({
      message: finalText,
      conversationHistory: updatedHistory,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.toString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    aiProvider: 'OpenAI ChatGPT',
    mcpConnected: !!(mcpFilesystemClient && mcpCalculatorClient),
    availableTools: availableTools.length,
  });
});

// Get available tools endpoint
app.get('/api/tools', (req, res) => {
  res.json({
    aiProvider: 'OpenAI ChatGPT',
    tools: availableTools.map(t => ({
      name: t.name,
      description: t.description,
      server: t.server,
    })),
  });
});

// Debug endpoint to see converted schemas
app.get('/api/debug/schemas', (req, res) => {
  const openaiTools = convertMCPToolsToOpenAI(availableTools);
  res.json({
    totalTools: availableTools.length,
    openaiSchemas: openaiTools,
  });
});

// Start server
async function startServer() {
  try {
    await initializeMCP();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🤖 AI Provider: OpenAI ChatGPT`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔧 Available tools: http://localhost:${PORT}/api/tools`);
      console.log(`🐛 Debug schemas: http://localhost:${PORT}/api/debug/schemas`);
      console.log('\n✨ Ready to chat! Open your browser and start chatting.\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
