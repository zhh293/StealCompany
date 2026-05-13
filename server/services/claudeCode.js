const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class ClaudeCodeSession extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sessionId = options.sessionId || null;
    this.workDir = options.workDir || process.env.HOME;
    this.process = null;
    this.killed = false;
  }

  send(prompt) {
    const args = ['--code', '-p', prompt, '--output-format', 'stream-json', '--verbose'];

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    this.killed = false;
    this.process = spawn('mc', args, {
      cwd: this.workDir,
      env: { ...process.env, TERM: 'dumb' },
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
      if (text.includes('Error') || text.includes('error')) {
        this.emit('error', { message: text });
      }
    });

    this.process.on('close', (code) => {
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
      this.emit('error', { message: `进程启动失败: ${err.message}` });
    });
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

      case 'assistant':
        if (event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'thinking') {
              this.emit('thinking', { text: block.thinking });
            } else if (block.type === 'text') {
              this.emit('text', { text: block.text });
            } else if (block.type === 'tool_use') {
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
