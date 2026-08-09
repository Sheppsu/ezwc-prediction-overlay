import asyncio
import logging
import json
from websockets.asyncio.server import serve, ServerConnection
from websockets.exceptions import ConnectionClosed


log = logging.getLogger(__name__)


class Server:
    def __init__(self, loop: asyncio.AbstractEventLoop, pw: str, initial_screen: str):
        self.loop = loop
        self.pw = pw

        self.clients: list[ServerConnection] = []
        self.logged_in: list[str] = []
        self.predictions: dict[str, dict[str, list]] = {}
        self.current_tab = initial_screen

    async def run(self, host: str, port: int):
        async with serve(self.handle, host, port):
            while True:
                await asyncio.sleep(1)

    async def handle(self, conn: ServerConnection):
        self.clients.append(conn)

        logged_in: bool = False
        username: str = ""

        try:
            await conn.send(self.get_data())

            while True:
                msg = await conn.recv()
                if type(msg) is bytes:
                    continue

                try:
                    data = json.loads(msg)
                    evt = data.get("type")
                    if evt == 1 and not logged_in:
                        if not data["username"]:
                            await conn.send(json.dumps({"error": "Must input a display name"}))
                            continue
                        if data["pw"] != self.pw:
                            await conn.send(json.dumps({"error": "Invalid password"}))
                            continue
                        if data["username"] in self.logged_in:
                            await conn.send(json.dumps({"error": "Name taken"}))
                            continue
                        username = data["username"]
                        logged_in = True
                        self.logged_in.append(username)
                        if username not in self.predictions:
                            self.predictions[username] = {
                                "1st": [],
                                "2nd": [],
                                "3rd": [],
                                "4th": [],
                                "5th-6th": [],
                                "7th-8th": [],
                                "9th-12th": [],
                                "13th-16th": [],
                                "17th-24th": [],
                                "25th-32nd": [],
                                "DNQ": []
                            }
                        await conn.send(json.dumps({"type": 1}))
                        await self.broadcast_data()
                    elif evt == 2 and logged_in:
                        country = data["country"]
                        for countries in self.predictions[username].values():
                            if country in countries:
                                countries.remove(country)
                                break
                        self.predictions[username][data["placement"]].append(country)
                        await self.broadcast_data()
                    elif evt == 3 and logged_in:
                        self.current_tab = data["tab"]
                        await self.broadcast_data()
                except (json.JSONDecodeError, KeyError):
                    continue
        except ConnectionClosed:
            return
        except Exception as e:
            log.exception("Exception while handling client", exc_info=e)
        finally:
            self.clients.remove(conn)
            if logged_in:
                self.logged_in.remove(username)

    def get_data(self):
        return json.dumps({
            "type": 2,
            "predictions": self.predictions,
            "currentTab": self.current_tab
        })

    async def broadcast_data(self):
        msg = self.get_data()
        await asyncio.gather(*(client.send(msg) for client in self.clients))


if __name__ == '__main__':
    import sys
    import dotenv
    import os

    dotenv.load_dotenv(override=True)

    logging.basicConfig(
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        level=logging.DEBUG if "--debug" in sys.argv else logging.INFO,
    )

    loop = asyncio.new_event_loop()
    server = Server(loop, os.getenv("PASSWORD"), os.getenv("INITIAL_SCREEN"))
    loop.run_until_complete(server.run(os.getenv("HOST"), int(os.getenv("PORT"))))
