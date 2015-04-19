from bottle import route, request, run, static_file, template
import os

HOST = "0.0.0.0"
DEFAULT_PORT = 5000

@route("/")
def index():
    user = request.query.user
    return template("aadminscore",
                    user=user)

@route('/static/<filename:path>')
def send_static(filename):
    return static_file(filename,
                       root='static')

run(host=HOST,
    port=int(os.environ.get("PORT", DEFAULT_PORT)),
    reloader=True)
