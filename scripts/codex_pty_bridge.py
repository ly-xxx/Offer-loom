#!/usr/bin/env python3
import base64
import fcntl
import json
import os
import select
import signal
import struct
import subprocess
import sys
import termios
import threading


ROOT_DIR = sys.argv[1]


class Bridge:
    def __init__(self):
        self.master_fd = None
        self.slave_fd = None
        self.process = None
        self.reader_thread = None
        self.lock = threading.Lock()

    def start(self, model: str, reasoning_effort: str):
        self.stop()

        self.master_fd, self.slave_fd = os.openpty()
        args = [
            "codex",
            "--cd",
            ROOT_DIR,
            "--no-alt-screen",
            "-a",
            "never",
            "-s",
            "danger-full-access",
            "-m",
            model,
            "-c",
            f'model_reasoning_effort="{reasoning_effort}"',
        ]

        env = os.environ.copy()
        env["TERM"] = env.get("TERM") or "xterm-256color"
        env["COLORTERM"] = env.get("COLORTERM") or "truecolor"

        try:
            self.process = subprocess.Popen(
                args,
                cwd=ROOT_DIR,
                env=env,
                stdin=self.slave_fd,
                stdout=self.slave_fd,
                stderr=self.slave_fd,
                start_new_session=True,
            )
        except Exception as exc:
            emit({
                "type": "error",
                "message": f"failed to launch codex: {exc}",
            })
            self.stop()
            return

        self.reader_thread = threading.Thread(
            target=self._read_output,
            args=(self.master_fd, self.process),
            daemon=True,
        )
        self.reader_thread.start()

    def stop(self):
        with self.lock:
            if self.process and self.process.poll() is None:
                try:
                    os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
                    except ProcessLookupError:
                        pass

            self.process = None

            for fd_name in ("master_fd", "slave_fd"):
                fd = getattr(self, fd_name)
                if fd is not None:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    setattr(self, fd_name, None)

    def write(self, data: str):
        if self.master_fd is None:
            return
        os.write(self.master_fd, data.encode("utf-8"))

    def resize(self, cols: int, rows: int):
        if self.master_fd is None:
            return
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)

    def _read_output(self, master_fd: int, process: subprocess.Popen):
        while True:
            ready, _, _ = select.select([master_fd], [], [], 0.2)
            if not ready:
                if process.poll() is not None:
                    break
                continue
            try:
                chunk = os.read(master_fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            emit({
                "type": "output",
                "data": base64.b64encode(chunk).decode("ascii"),
            })

        emit({
            "type": "exit",
            "exitCode": process.poll(),
        })


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    bridge = Bridge()
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            emit({
                "type": "error",
                "message": "invalid json command",
            })
            continue

        command_type = message.get("type")
        if command_type == "start":
            bridge.start(message.get("model", "gpt-5"), message.get("reasoningEffort", "high"))
        elif command_type == "input":
            bridge.write(message.get("data", ""))
        elif command_type == "resize":
            bridge.resize(int(message.get("cols", 120)), int(message.get("rows", 36)))

    bridge.stop()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({
            "type": "error",
            "message": str(exc),
        })
