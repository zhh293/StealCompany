const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const os = require('os');
const config = require('../config');
const { getPermissionMode } = require('./permissionSettings');

// Windows 下用 ; 分隔 PATH，Unix 用 :
const isWin = process.platform === 'win32';
const pathSep = isWin ? ';' : ':';
const extraPaths = isWin
  ? [path.join(os.homedir(), '.local', 'bin')]
  : ['/usr/local/bin', '/opt/homebrew/bin', path.join(os.homedir(), '.local', 'bin')];
const fullPath = [...extraPaths, process.env.PATH].join(pathSep);

class ClaudeCodeSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || null;
    this.workDir = options.workDir || os.homedir();
    this.model = options.model || null;
    this.process = null;
    this.killed = false;
    this.permissionMode = options.permissionMode || getPermissionMode();
    this._pendingPermission = null; // 当前待确认的权限请求
  }

  send(prompt) {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    // 权限模式
    if (this.permissionMode === 'auto') {
      args.push('--dangerously-skip-permissions');
    }
    // manual 模式不加跳过参数，使用 stream-json 双向交互

    if (this.model) {
      args.push('--model', this.model);
    }

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    // manual 模式需要双向流式通信
    if (this.permissionMode === 'manual') {
      args.push('--input-format', 'stream-json');
    }

    this.killed = false;
    const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';
    console.log('[ClaudeCode] spawn:', claudePath, JSON.stringify(args));
    console.log('[ClaudeCode] cwd:', this.workDir);
    this.process = spawn(claudePath, args, {
      cwd: this.workDir,
      env: { ...process.env, PATH: fullPath, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buffer = '';

    this.process.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          this._handleEvent(event);
        } catch (e) {
          this.emit('raw', { text: line });
        }
      }
    });

    this.process.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      console.log('[ClaudeCode] stderr:', text.slice(0, 300));
      if (text.includes('Error') || text.includes('error')) {
        this.emit('error', { message: text });
      }
    });

    this.process.on('close', (code) => {
      console.log('[ClaudeCode] exit code:', code);
      if (buffer.trim()) {
        try {
          this._handleEvent(JSON.parse(buffer));
        } catch (e) { /* ignore */ }
      }
      if (!this.killed) {
        this.emit('close', { code });
      }
    });

    this.process.on('error', (err) => {
      console.log('[ClaudeCode] spawn error:', err.code, err.message);
      this.emit('error', { message: `进程启动失败: ${err.message}` });
    });
  }

  /**
   * 用户对权限请求的响应
   * @param {string} requestId - 请求 ID
   * @param {boolean} allow - 是否允许
   */
  respondToPermission(requestId, allow) {
    if (!this.process || this.process.killed) return;
    if (!this._pendingPermission || this._pendingPermission.id !== requestId) return;

    // 向 Claude Code stdin 写入确认响应
    // stream-json input 格式的权限响应
    const response = JSON.stringify({
      type: 'permission_response',
      id: requestId,
      allow: allow,
    }) + '\n';

    try {
      this.process.stdin.write(response);
    } catch (e) {
      this.emit('error', { message: `写入权限响应失败: ${e.message}` });
    }

    this._pendingPermission = null;
  }

  _handleEvent(event) {
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          this.sessionId = event.session_id;
          this.emit('init', {
            sessionId: event.session_id,
            model: event.model,
            tools: event.tools || [],
          });
        }
        break;

      // 逐 token 流式事件
      case 'stream_event':
        this._handleStreamEvent(event.event);
        break;

      // 权限确认请求（Claude Code 在 manual 模式下会发送）
      case 'permission_request':
        this._handlePermissionRequest(event);
        break;

      // 完整消息（作为 fallback，在 stream_event 完成后也会收到）
      case 'assistant':
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'tool_use') {
              this.emit('tool_use', {
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }
        }
        break;

      case 'user':
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'tool_result') {
              this.emit('tool_result', {
                id: block.tool_use_id,
                content: block.content,
              });
            }
          }
        }
        break;

      case 'result':
        this.emit('result', {
          success: event.subtype === 'success',
          result: event.result,
          cost: event.total_cost_usd || 0,
          duration: event.duration_ms || 0,
          sessionId: event.session_id,
        });
        break;
    }
  }

  _handlePermissionRequest(event) {
    const request = {
      id: event.id || `perm_${Date.now()}`,
      tool: event.tool || event.tool_name || 'unknown',
      description: event.description || event.message || '',
      input: event.input || event.tool_input || {},
      risk: event.risk || 'medium',
    };

    this._pendingPermission = request;
    this.emit('permission_request', request);

    // 如果 30 秒内没有响应，自动拒绝
    setTimeout(() => {
      if (this._pendingPermission && this._pendingPermission.id === request.id) {
        this.respondToPermission(request.id, false);
        this.emit('permission_timeout', { id: request.id });
      }
    }, 30000);
  }

  _handleStreamEvent(streamEvent) {
    if (!streamEvent) return;

    switch (streamEvent.type) {
      case 'content_block_start':
        if (streamEvent.content_block?.type === 'thinking') {
          this.emit('thinking_start', {});
        } else if (streamEvent.content_block?.type === 'text') {
          this.emit('text_start', {});
        }
        break;

      case 'content_block_delta':
        if (streamEvent.delta?.type === 'thinking_delta') {
          this.emit('thinking_delta', { text: streamEvent.delta.thinking });
        } else if (streamEvent.delta?.type === 'text_delta') {
          this.emit('text_delta', { text: streamEvent.delta.text });
        }
        break;

      case 'content_block_stop':
        break;

      case 'message_start':
        break;

      case 'message_delta':
        break;

      case 'message_stop':
        break;
    }
  }

  stop() {
    this.killed = true;
    if (this.process && !this.process.killed) {
      this.process.kill('SIGINT');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 2000);
    }
  }
}

module.exports = ClaudeCodeSession;
