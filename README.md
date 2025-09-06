# ErgoSum CLI

A powerful command-line interface for integrating ErgoSum memory and context with AI tools like Claude Code, Codex, Gemini CLI, and more.

## 🚀 Features

- **Memory Management**: Store, search, and retrieve memories from ErgoSum
- **AI Tool Integration**: Seamlessly inject context into Claude Code, Codex, Gemini CLI
- **Context Generation**: Automatically provide relevant context to AI tools
- **Authentication**: Secure OAuth integration with ErgoSum platform
- **Multiple Formats**: Support for Markdown, JSON, YAML, and text output
- **Interactive Mode**: Guided commands with prompts and validation

## 📦 Installation

### From npm (coming soon)
```bash
npm install -g ergosum-cli
```

### From source
```bash
git clone https://github.com/TwoErgoSum/ErgoSum-cli.git
cd ErgoSum-cli
npm install
npm run build
npm link
```

## 🔧 Quick Start

### 1. Authentication
```bash
# Authenticate with ErgoSum
ergosum auth login

# Check authentication status
ergosum auth status
```

### 2. Memory Management
```bash
# Store a memory quickly
ergosum add "React hooks are functions that let you use state"

# Store with more details
ergosum memory store --title "React Hooks" --type CODE --tags "react,javascript"

# Search memories
ergosum search "react hooks"

# List recent memories
ergosum memory list --limit 10
```

### 3. AI Tool Integration
```bash
# Setup Claude Code integration
ergosum claude setup

# Ask Claude with ErgoSum context
ergosum claude ask "How do I use React hooks effectively?"

# Preview context before sending
ergosum claude context "react hooks"
```

## 📚 Commands

### Authentication
```bash
ergosum auth login          # Login via OAuth or token
ergosum auth logout         # Remove credentials
ergosum auth status         # Check authentication status
ergosum auth whoami         # Show user information
```

### Memory Management
```bash
ergosum memory store        # Store new memory
ergosum memory list         # List memories
ergosum memory search       # Search memories
ergosum memory show <id>    # Show specific memory
ergosum memory delete <id>  # Delete memory
ergosum memory context      # Generate context from memories
```

### Claude Code Integration
```bash
ergosum claude setup        # Setup Claude integration
ergosum claude ask          # Ask Claude with context
ergosum claude context      # Preview context
ergosum claude wrap         # Wrap Claude commands
```

### Configuration
```bash
ergosum config setup        # Interactive setup
ergosum config get          # Show configuration
ergosum config set          # Set configuration values
ergosum config list         # List all settings
```

### Quick Commands
```bash
ergosum search <query>      # Quick memory search
ergosum add <content>       # Quick memory storage
ergosum status              # CLI health check
```

## 🔗 AI Tool Integrations

### Claude Code
The CLI seamlessly integrates with Claude Code by injecting relevant ErgoSum memories as context:

```bash
# Ask Claude with automatic context injection
ergosum claude ask "How to optimize React performance?"

# Preview what context would be sent
ergosum claude context "React performance"

# Wrap any Claude command with context
ergosum claude wrap --context "React" ask "Best practices?"
```

### Other AI Tools
Support for additional tools:
- **Codex**: GitHub Codex CLI integration
- **Gemini CLI**: Google Gemini CLI integration  
- **Cursor**: Cursor CLI integration

## 📖 Usage Examples

### Store Development Notes
```bash
# Store a code snippet
ergosum memory store \
  --title "React useEffect cleanup" \
  --type CODE \
  --tags "react,hooks,cleanup" \
  --content "useEffect(() => {
    const subscription = subscribe();
    return () => subscription.unsubscribe();
  }, []);"
```

### Search and Use Context
```bash
# Search for React-related memories
ergosum search "react performance" --limit 5

# Generate context for AI tools
ergosum memory context "react optimization" --format markdown

# Use with Claude Code directly
ergosum claude ask "How to prevent unnecessary re-renders?" \
  --context "react performance"
```

### Batch Operations
```bash
# Store multiple memories from files
find ./docs -name "*.md" -exec ergosum memory store --file {} --tags "docs" \;

# Export memories to files
ergosum memory list --format json > memories.json
```

## ⚙️ Configuration

The CLI uses a configuration file stored at:
- **macOS/Linux**: `~/.config/ergosum-cli/config.json`
- **Windows**: `%APPDATA%\ergosum-cli\config.json`

### Default Configuration
```json
{
  "apiUrl": "https://api.ergosum.cc/api/v1",
  "defaultTags": ["cli"],
  "integrations": {
    "claudeCode": false,
    "codex": false,
    "gemini": false
  }
}
```

### Environment Variables
```bash
export ERGOSUM_API_URL="https://api.ergosum.cc/api/v1"
export ERGOSUM_TOKEN="your-token-here"
export DEBUG=1  # Enable verbose logging
```

## 🏗️ Architecture

### Core Components
- **API Client**: HTTP client for ErgoSum REST API
- **Context Injector**: Intelligent context generation for AI tools
- **Config Manager**: Secure configuration and credential storage
- **Command System**: Extensible command structure with Commander.js

### AI Tool Integration
The CLI uses a plugin-based system to integrate with different AI tools:

```typescript
interface AITool {
  name: string;
  command: string;
  contextFlag?: string;
  supportedFormats: string[];
}
```

Each tool integration can:
- Search relevant memories based on user queries
- Format context in the tool's preferred format
- Inject context via command-line flags or files
- Wrap existing tool commands transparently

## 🔐 Security

- **OAuth Authentication**: Secure authentication via ErgoSum platform
- **Token Storage**: Encrypted credential storage using OS keychain
- **API Security**: HTTPS-only communication with proper error handling
- **Privacy**: Local context processing with user control over data sharing

## 🤝 Contributing

### Development Setup
```bash
git clone https://github.com/TwoErgoSum/ErgoSum-cli.git
cd ErgoSum-cli
npm install
npm run dev  # Development mode with watch
```

### Running Tests
```bash
npm test
npm run test:watch
npm run test:coverage
```

### Building
```bash
npm run build
npm run typecheck
npm run lint
```

## 📄 License

MIT - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: [docs.ergosum.cc](https://docs.ergosum.cc)
- **GitHub**: [github.com/TwoErgoSum/ErgoSum-cli](https://github.com/TwoErgoSum/ErgoSum-cli)
- **Issues**: [github.com/TwoErgoSum/ErgoSum-cli/issues](https://github.com/TwoErgoSum/ErgoSum-cli/issues)
- **ErgoSum Platform**: [ergosum.cc](https://ergosum.cc)

---

**ErgoSum CLI** - Supercharge your AI tools with persistent memory and context 🧠✨