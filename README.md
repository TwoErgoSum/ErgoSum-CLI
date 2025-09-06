# ErgoSum CLI

A powerful command-line interface for integrating ErgoSum memory and context with AI tools like Claude Code, Codex, Gemini CLI, and more.

## ✨ What's New in v0.2.0

- **🛡️ Enterprise-grade error handling** with automatic retry and recovery
- **📊 Advanced logging system** with debug modes and file output  
- **💾 Offline mode** with intelligent caching for working without internet
- **🎯 Enhanced UX** with progress bars, spinners, and better feedback
- **🔒 Input validation** and sanitization for security
- **⚡ Performance optimizations** with smart caching strategies

## 🚀 Features

- **Memory Management**: Store, search, and retrieve memories from ErgoSum
- **AI Tool Integration**: Seamlessly inject context into Claude Code and other AI tools
- **Offline Mode**: Work without internet using persistent local caching
- **Smart Caching**: Reduce API calls and improve performance
- **Progress Tracking**: Beautiful progress indicators for all operations
- **Error Recovery**: Robust error handling with automatic retries
- **Debug Logging**: Comprehensive logging with multiple verbosity levels
- **Input Validation**: Secure input sanitization and schema validation

## 📦 Installation

```bash
npm install -g ergosum-cli
```

After installation, you can use either:
- **`ergosum`** - Full command name  
- **`egs`** - Short alias for quick access

### Verify Installation
```bash
ergosum --version  # Shows current version
ergosum --help     # Shows all available commands
```

## 🔧 Quick Start

### 1. Check Status
```bash
ergosum status
# Shows authentication status, API connectivity, and integrations
```

### 2. Authentication
```bash
# Start authentication process
ergosum auth login

# Check if you're logged in
ergosum auth status
```

### 3. Store Your First Memory
```bash
# Quick storage
ergosum add "TypeScript interfaces help catch errors at compile time"

# Detailed storage with metadata
ergosum memory store \
  --title "TypeScript Best Practices" \
  --type CODE \
  --tags "typescript,development,best-practices"
```

### 4. Search and Retrieve
```bash
# Quick search
ergosum search "typescript"

# Detailed search with options
ergosum memory search "typescript interfaces" \
  --limit 10 \
  --format table
```

### 5. AI Integration
```bash
# Setup Claude Code integration
ergosum claude setup

# Ask Claude with automatic context from your memories
ergosum claude ask "How should I structure TypeScript interfaces?"
```

## 📚 Complete Command Reference

### Authentication
| Command | Description |
|---------|-------------|
| `ergosum auth login` | Authenticate with ErgoSum (OAuth or token) |
| `ergosum auth logout` | Remove stored credentials |
| `ergosum auth status` | Check authentication status |
| `ergosum auth whoami` | Show current user information |

### Memory Management
| Command | Description |
|---------|-------------|
| `ergosum memory store` | Store new memory with interactive prompts |
| `ergosum memory list` | List all memories with pagination |
| `ergosum memory search <query>` | Search memories by content |
| `ergosum memory show <id>` | Display specific memory details |
| `ergosum memory delete <id>` | Remove a memory (with confirmation) |
| `ergosum memory context <query>` | Generate context from relevant memories |

### Cache Management
| Command | Description |
|---------|-------------|
| `ergosum cache status` | Show cache statistics and hit rates |
| `ergosum cache clear` | Clear all cached data |
| `ergosum cache offline` | Enable offline mode with persistence |
| `ergosum cache online` | Disable offline mode |
| `ergosum cache warmup` | Pre-load frequently accessed data |

### Claude Code Integration
| Command | Description |
|---------|-------------|
| `ergosum claude setup` | Configure Claude Code integration |
| `ergosum claude ask <question>` | Ask Claude with ErgoSum context |
| `ergosum claude context <query>` | Preview context that would be sent |
| `ergosum claude wrap <command>` | Wrap any Claude command with context |

### Configuration
| Command | Description |
|---------|-------------|
| `ergosum config list` | Show all configuration settings |
| `ergosum config get <key>` | Get specific configuration value |
| `ergosum config set <key> <value>` | Set configuration value |
| `ergosum config setup` | Interactive configuration wizard |

### Quick Shortcuts
| Command | Description |
|---------|-------------|
| `ergosum add <content>` | Quick memory storage |
| `ergosum search <query>` | Quick memory search |
| `ergosum status` | Overall CLI health check |

## 💡 Usage Examples

### Development Workflow
```bash
# Store a code snippet you discovered
ergosum add "Use React.memo() to prevent unnecessary re-renders" \
  --tags "react,performance,optimization"

# Later, when working on optimization
ergosum claude ask "How can I optimize this React component?" 
# Automatically includes your stored context about React.memo()
```

### Research and Learning
```bash
# Store research findings
ergosum memory store \
  --title "Database Indexing Strategies" \
  --type DOCUMENT \
  --tags "database,performance,postgresql" \
  --content "B-tree indexes work best for equality and range queries..."

# Search when needed
ergosum search "database indexing" --format json | jq '.memories[].title'
```

### Working Offline
```bash
# Enable offline mode
ergosum cache offline

# Warm up cache with frequently used data
ergosum cache warmup --limit 50

# Now you can search and access memories without internet
ergosum search "react hooks"  # Uses cached data
```

### Debugging and Monitoring
```bash
# Enable debug logging
DEBUG=1 ergosum --verbose memory list

# Check cache performance
ergosum cache status

# View detailed logs
tail -f ~/.cache/ergosum-cli/ergosum-cli.log
```

## ⚙️ Configuration

### Configuration File Location
- **macOS/Linux**: `~/.config/ergosum-cli/config.json`
- **Windows**: `%APPDATA%\ergosum-cli\config.json`

### Environment Variables
```bash
# API Configuration
export ERGOSUM_API_URL="https://api.ergosum.cc/api/v1"
export ERGOSUM_TOKEN="your-access-token"

# Debugging
export DEBUG=1           # Enable debug output
export VERBOSE=1         # Enable verbose logging
export LOG_FILE=1        # Enable file logging
```

### Default Settings
```json
{
  "apiUrl": "https://api.ergosum.cc/api/v1",
  "defaultTags": ["cli"],
  "offlineMode": false,
  "integrations": {
    "claudeCode": true,
    "codex": false,
    "gemini": false
  }
}
```

## 🎯 Advanced Features

### Smart Caching
- **Memory Cache**: Hot data cached for 5 minutes
- **Disk Cache**: Persistent storage for offline mode
- **Auto-Invalidation**: Cache cleared when data changes
- **Hit Rate Monitoring**: Track cache performance

### Error Recovery
- **Automatic Retry**: Failed requests retry with exponential backoff
- **Graceful Degradation**: Falls back to cached data when offline
- **User-Friendly Messages**: Clear error explanations with next steps

### Performance Monitoring
```bash
# View cache statistics
ergosum cache status

# Monitor API performance  
DEBUG=1 ergosum memory list  # Shows request timing
```

## 🔐 Security & Privacy

- **Secure Authentication**: OAuth2 flow with ErgoSum platform
- **Local Storage**: Credentials stored securely using OS keychain
- **Input Validation**: All inputs sanitized and validated
- **HTTPS Only**: All API communication encrypted
- **Privacy First**: Context processing happens locally

## 🛠️ Development

### Requirements
- Node.js 18+ 
- npm or yarn
- TypeScript 5+

### Local Development
```bash
git clone https://github.com/TwoErgoSum/ErgoSum-CLI.git
cd ErgoSum-CLI
npm install
npm run dev  # Watch mode for development
```

### Building
```bash
npm run build      # Compile TypeScript
npm run typecheck  # Type checking only
npm run lint       # Code linting
```

### Testing
```bash
npm test           # Run test suite
npm run test:watch # Watch mode
npm run test:coverage # Coverage report
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **npm Package**: [npmjs.com/package/ergosum-cli](https://npmjs.com/package/ergosum-cli)
- **GitHub Repository**: [github.com/TwoErgoSum/ErgoSum-CLI](https://github.com/TwoErgoSum/ErgoSum-CLI)
- **Report Issues**: [github.com/TwoErgoSum/ErgoSum-CLI/issues](https://github.com/TwoErgoSum/ErgoSum-CLI/issues)
- **ErgoSum Platform**: [ergosum.cc](https://ergosum.cc)

---

**ErgoSum CLI v0.2.0** - Enterprise-ready CLI for AI-powered memory management 🧠⚡