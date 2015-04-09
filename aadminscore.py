from flask import Flask, render_template, request

app = Flask(__name__)

@app.route("/")
def main():
    return render_template("aadminscore.html",
                           user=request.args.get("user", ""))

if __name__ == "__main__":
    app.run(debug=True)
