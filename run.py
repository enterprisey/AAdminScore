from flask import Flask, render_template, request
import os

HOST = "0.0.0.0"
DEFAULT_PORT = 5000

app = Flask(__name__)

@app.route("/")
def main():
    return render_template("aadminscore.html",
                           user=request.args.get("user", ""))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    app.run(debug=True, host=HOST, port=port)
