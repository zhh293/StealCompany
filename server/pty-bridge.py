#!/usr/bin/env python3
"""
PTY Bridge - 为 Node.js 提供伪终端能力
通过 stdin/stdout pipe 与 Node 通信，内部使用 Python pty 模块分配真实 PTY
"""
import os
import sys
import pty
import select
import signal
import struct
import fcntl
import termios

def set_winsize(fd, rows, cols):
    winsize = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def main():
    shell = os.environ.get('SHELL', '/bin/zsh')
    cols = int(os.environ.get('COLUMNS', '80'))
    rows = int(os.environ.get('LINES', '24'))
    cwd = os.environ.get('PTY_CWD', os.environ.get('HOME', '/'))

    # 创建 pty
    pid, master_fd = pty.fork()

    if pid == 0:
        # 子进程 - 执行 shell
        os.chdir(cwd)
        os.execvp(shell, [shell, '--login', '-i'])
    else:
        # 父进程 - 桥接 stdin/stdout <-> pty master
        set_winsize(master_fd, rows, cols)

        # 设置 stdin 为非阻塞
        flags = fcntl.fcntl(sys.stdin.fileno(), fcntl.F_GETFL)
        fcntl.fcntl(sys.stdin.fileno(), fcntl.F_SETFL, flags | os.O_NONBLOCK)

        # 处理 SIGWINCH (窗口大小变化，通过环境变量传入新尺寸)
        def handle_sigwinch(signum, frame):
            pass
        signal.signal(signal.SIGWINCH, handle_sigwinch)

        try:
            while True:
                rlist = [sys.stdin.fileno(), master_fd]
                try:
                    r, _, _ = select.select(rlist, [], [], 0.05)
                except (select.error, OSError):
                    break

                if master_fd in r:
                    try:
                        data = os.read(master_fd, 4096)
                        if not data:
                            break
                        sys.stdout.buffer.write(data)
                        sys.stdout.buffer.flush()
                    except OSError:
                        break

                if sys.stdin.fileno() in r:
                    try:
                        data = os.read(sys.stdin.fileno(), 4096)
                        if not data:
                            break
                        os.write(master_fd, data)
                    except OSError:
                        break

                # 检查子进程是否退出
                result = os.waitpid(pid, os.WNOHANG)
                if result[0] != 0:
                    break

        except KeyboardInterrupt:
            pass
        finally:
            os.close(master_fd)
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

if __name__ == '__main__':
    main()
