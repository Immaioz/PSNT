from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, ValidationError, Length
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from pathlib import Path
import json
import os
from sqlalchemy import inspect, text, func

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "workouts.db")
IS_VERCEL = os.environ.get("VERCEL") == "1"


def get_database_uri():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url
    return "sqlite:///" + Path(DB_PATH).as_posix()


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = get_database_uri()
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-in-production")
app.config["WTF_CSRF_ENABLED"] = True
app.config["SESSION_COOKIE_SECURE"] = IS_VERCEL
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

if IS_VERCEL:
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message = "Per favore accedi per accedere a questa pagina."
login_manager.login_message_category = "info"

# ============= MODELLI =============

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    workouts = db.relationship('Workout', backref='user', lazy=True, cascade='all, delete-orphan')
    weight_history = db.relationship('WeightHistory', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f"<User {self.username}>"


class Workout(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    exercise = db.Column(db.String(120), nullable=False)
    exercise_id = db.Column(db.String(10), nullable=True)
    sets = db.Column(db.Integer, nullable=True)
    reps = db.Column(db.String(50), nullable=True)
    weight = db.Column(db.String(50), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    day = db.Column(db.String(10), nullable=True)
    position = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Workout {self.id} {self.exercise} on {self.date} ({self.day}#{self.position})>"


class WeightHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    workout_id = db.Column(db.Integer, db.ForeignKey('workout.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    weight = db.Column(db.Float, nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<WeightHistory {self.id} workout={self.workout_id} {self.weight}kg on {self.date}>"


def log_weight(workout, weight_str):
    """Log a weight entry to history if weight is a valid number."""
    if not weight_str:
        return
    try:
        w_val = float(weight_str.replace(",", "."))
    except (ValueError, AttributeError):
        return
    entry = WeightHistory(
        workout_id=workout.id,
        user_id=workout.user_id,
        weight=w_val,
        date=workout.date,
    )
    db.session.add(entry)


# ============= FORM =============

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Ricordami')
    submit = SubmitField('Accedi')


class RegisterForm(FlaskForm):
    username = StringField('Username', 
                          validators=[DataRequired(), Length(min=3, max=80)])
    email = StringField('Email', 
                       validators=[DataRequired(), Email()])
    password = PasswordField('Password', 
                            validators=[DataRequired(), Length(min=6)])
    password_confirm = PasswordField('Conferma Password', 
                                    validators=[DataRequired(), EqualTo('password', message='Le password non coincidono')])
    submit = SubmitField('Registrati')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('Questo username è già in uso.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('Questo email è già registrato.')


# ============= USER LOADER =============

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


# ============= DATABASE MIGRATION =============

def ensure_database():
    """Crea tabelle e migra dati dal vecchio DB"""
    with app.app_context():
        try:
            db.create_all()
            print("✓ Database tables created/verified")
            
            # Verifica e aggiungi colonna user_id se manca
            inspector = inspect(db.engine)
            cols = [c["name"] for c in inspector.get_columns('workout')]
            
            if "user_id" not in cols:
                print("→ Aggiungendo colonna user_id...")
                db.session.execute(text("ALTER TABLE workout ADD COLUMN user_id INTEGER"))
                db.session.commit()
                print("✓ Colonna user_id aggiunta")
            
            if "day" not in cols:
                print("→ Aggiungendo colonna day...")
                db.session.execute(text("ALTER TABLE workout ADD COLUMN day VARCHAR(10)"))
                db.session.commit()
                print("✓ Colonna day aggiunta")
            
            if "position" not in cols:
                print("→ Aggiungendo colonna position...")
                db.session.execute(text("ALTER TABLE workout ADD COLUMN position INTEGER"))
                db.session.commit()
                print("✓ Colonna position aggiunta")
            
            if "notes" not in cols:
                print("→ Aggiungendo colonna notes...")
                db.session.execute(text("ALTER TABLE workout ADD COLUMN notes TEXT"))
                db.session.commit()
                print("✓ Colonna notes aggiunta")
            
            if "created_at" not in cols:
                print("→ Aggiungendo colonna created_at...")
                if db.engine.dialect.name == "postgresql":
                    db.session.execute(text(
                        "ALTER TABLE workout ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                    ))
                else:
                    db.session.execute(text(
                        "ALTER TABLE workout ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
                    ))
                db.session.commit()
                print("✓ Colonna created_at aggiunta")
            
            if "exercise_id" not in cols:
                print("→ Aggiungendo colonna exercise_id...")
                db.session.execute(text("ALTER TABLE workout ADD COLUMN exercise_id VARCHAR(10)"))
                db.session.commit()
                print("✓ Colonna exercise_id aggiunta")
            
            # Crea utente admin se non esiste
            default_user = User.query.filter_by(username='admin').first()
            admin_password = os.environ.get("ADMIN_PASSWORD")
            if not admin_password and not IS_VERCEL and not os.environ.get("DATABASE_URL"):
                admin_password = "admin123"
            if not default_user and admin_password:
                print("→ Creando utente admin di default...")
                admin = User(
                    username=os.environ.get("ADMIN_USERNAME", "admin"),
                    email=os.environ.get("ADMIN_EMAIL", "admin@example.com")
                )
                admin.set_password(admin_password)
                db.session.add(admin)
                db.session.commit()
                print("✓ Utente admin creato")
            
            # Recupera tutti gli utenti
            all_users = User.query.all()
            print(f"→ Trovati {len(all_users)} utenti nel database")
            
            # Ottieni tutti i workout senza user_id
            unassigned_workouts = Workout.query.filter_by(user_id=None).all()
            
            if unassigned_workouts and all_users:
                print(f"→ Assegnando {len(unassigned_workouts)} workout a {len(all_users)} utenti...")
                
                # Assegna i workout a tutti gli utenti (crea copie per ogni utente)
                for user in all_users:
                    user_workout_count = 0
                    for wo in unassigned_workouts:
                        # Crea una copia del workout per questo utente
                        new_workout = Workout(
                            user_id=user.id,
                            date=wo.date,
                            exercise=wo.exercise,
                            exercise_id=wo.exercise_id,
                            sets=wo.sets,
                            reps=wo.reps,
                            weight=wo.weight,
                            notes=wo.notes,
                            day=wo.day,
                            position=wo.position,
                            created_at=wo.created_at
                        )
                        db.session.add(new_workout)
                        user_workout_count += 1
                    db.session.commit()
                    print(f"  ✓ {user_workout_count} workout assegnati a {user.username}")
                
                # Cancella i workout originali senza user_id
                for wo in unassigned_workouts:
                    db.session.delete(wo)
                db.session.commit()
                print(f"✓ Workout originali rimossi")
            
            # Backfill positions per day per ogni utente
            print("→ Riorganizzando posizioni...")
            days = ["Day1", "Day2", "Day3", "Day4", "Day5"]
            for user in all_users:
                for day in days:
                    rows = Workout.query.filter_by(day=day, user_id=user.id).order_by(Workout.created_at.asc(), Workout.date.asc()).all()
                    for idx, r in enumerate(rows, start=1):
                        if r.position != idx:
                            r.position = idx
                    db.session.commit()
            print("✓ Posizioni riorganizzate")
            
        except Exception as e:
            print(f"⚠ Warning in database migration: {e}")
            db.session.rollback()


# ============= EXERCISES DATASET =============

EXERCISES_DATA = []
EXERCISES_BY_ID = {}
EXERCISES_TRANSLATIONS = {}


def load_exercises():
    global EXERCISES_DATA, EXERCISES_BY_ID, EXERCISES_TRANSLATIONS
    base = os.path.join(BASE_DIR, "static", "exercises")
    try:
        with open(os.path.join(base, "exercises.json"), "r", encoding="utf-8") as f:
            EXERCISES_DATA = json.load(f)
        EXERCISES_BY_ID = {ex["id"]: ex for ex in EXERCISES_DATA}
        print(f"Loaded {len(EXERCISES_DATA)} exercises from dataset")
    except Exception as e:
        print(f"Warning: could not load exercises dataset: {e}")
    try:
        with open(os.path.join(base, "translations_it.json"), "r", encoding="utf-8") as f:
            EXERCISES_TRANSLATIONS = json.load(f)
        print(f"Loaded Italian translations")
    except Exception as e:
        print(f"Warning: could not load Italian translations: {e}")


def get_exercise_name_it(ex):
    names_it = EXERCISES_TRANSLATIONS.get("names_it", {})
    return names_it.get(ex["name"].lower(), ex["name"])


def get_body_part_it(bp):
    return EXERCISES_TRANSLATIONS.get("body_part", {}).get(bp.lower(), bp)


def get_target_it(tgt):
    return EXERCISES_TRANSLATIONS.get("target", {}).get(tgt.lower(), tgt)


def get_equipment_it(eq):
    return EXERCISES_TRANSLATIONS.get("equipment", {}).get(eq.lower(), eq)


# ============= ROUTES EXERCISES API =============

@app.route("/api/exercises")
@login_required
def search_exercises():
    q = request.args.get("q", "").strip().lower()
    body_part = request.args.get("body_part", "").strip().lower()
    equipment = request.args.get("equipment", "").strip().lower()

    results = EXERCISES_DATA

    if q:
        results = [e for e in results if q in e["name"].lower() or q in get_exercise_name_it(e).lower()]
    if body_part:
        results = [e for e in results if e.get("body_part", "").lower() == body_part]
    if equipment:
        results = [e for e in results if e.get("equipment", "").lower() == equipment]

    return jsonify([{
        "id": e["id"],
        "name": e["name"],
        "name_it": get_exercise_name_it(e),
        "body_part": e.get("body_part", ""),
        "body_part_it": get_body_part_it(e.get("body_part", "")),
        "target": e.get("target", ""),
        "target_it": get_target_it(e.get("target", "")),
        "equipment": e.get("equipment", ""),
        "equipment_it": get_equipment_it(e.get("equipment", "")),
        "image": url_for("static", filename="exercises/" + e.get("image", ""))
    } for e in results[:50]])


@app.route("/api/exercises/<exercise_id>")
@login_required
def get_exercise_detail(exercise_id):
    ex = EXERCISES_BY_ID.get(exercise_id)
    if not ex:
        return jsonify({"error": "Esercizio non trovato"}), 404
    result = dict(ex)
    result["name_it"] = get_exercise_name_it(ex)
    result["body_part_it"] = get_body_part_it(ex.get("body_part", ""))
    result["target_it"] = get_target_it(ex.get("target", ""))
    result["equipment_it"] = get_equipment_it(ex.get("equipment", ""))
    if result.get("image"):
        result["image"] = url_for("static", filename="exercises/" + result["image"])
    if result.get("gif_url"):
        result["gif_url"] = url_for("static", filename="exercises/" + result["gif_url"])
    return jsonify(result)


# ============= ERROR HANDLERS =============

@app.errorhandler(404)
def not_found_error(error):
    return render_template('404.html'), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500


# ============= ROUTES AUTH =============

@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    
    form = RegisterForm()
    if form.validate_on_submit():
        try:
            user = User(
                username=form.username.data.strip(),
                email=form.email.data.strip().lower()
            )
            user.set_password(form.password.data)
            
            db.session.add(user)
            db.session.flush()  # Flush per ottenere l'ID senza commit
            
            # Assegna tutti i workout default a questo nuovo utente
            admin_user = User.query.filter_by(username='admin').first()
            if admin_user:
                default_workouts = Workout.query.filter_by(user_id=admin_user.id).all()
                
                for wo in default_workouts:
                    new_workout = Workout(
                        user_id=user.id,
                        date=wo.date,
                        exercise=wo.exercise,
                        exercise_id=wo.exercise_id,
                        sets=wo.sets,
                        reps=wo.reps,
                        weight=wo.weight,
                        notes=wo.notes,
                        day=wo.day,
                        position=wo.position,
                        created_at=wo.created_at
                    )
                    db.session.add(new_workout)
            
            db.session.commit()
            
            flash("✓ Registrazione completata! Accedi ora.", "success")
            return redirect(url_for("login"))
        
        except Exception as e:
            db.session.rollback()
            print(f"Registration error: {e}")
            flash(f"✗ Errore durante la registrazione: {str(e)}", "danger")
            return render_template("landing.html", form=form)
    
    return render_template("landing.html", form=form)


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    
    form = LoginForm()
    if form.validate_on_submit():
        try:
            user = User.query.filter_by(username=form.username.data.strip()).first()
            if user is None or not user.check_password(form.password.data):
                flash("✗ Username o password non validi.", "danger")
                return redirect(url_for("login"))
            
            login_user(user, remember=form.remember_me.data)
            next_page = request.args.get('next')
            if not next_page or not url_has_allowed_host_and_scheme(next_page):
                next_page = url_for('dashboard')
            return redirect(next_page)
        
        except Exception as e:
            print(f"Login error: {e}")
            flash("✗ Errore durante il login.", "danger")
    
    return render_template("login.html", form=form)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("✓ Logout completato.", "info")
    return redirect(url_for("landing"))


# ============= ROUTES WORKOUTS =============

@app.route("/")
def landing():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    form = RegisterForm()
    return render_template("landing.html", form=form)


@app.route("/dashboard")
@login_required
def dashboard():
    days = ["Day1", "Day2", "Day3", "Day4", "Day5"]
    day_groups = {}
    for d in days:
        workouts = Workout.query.filter_by(day=d, user_id=current_user.id).order_by(
            func.coalesce(Workout.position, 9999).asc(), Workout.position.asc(), Workout.created_at.asc()
        ).all()
        day_groups[d] = workouts
    return render_template("index.html", day_groups=day_groups, days=days)


@app.route("/day/<day_name>")
@login_required
def day_view(day_name):
    workouts = Workout.query.filter_by(day=day_name, user_id=current_user.id).order_by(
        func.coalesce(Workout.position, 9999).asc(), Workout.position.asc(), Workout.created_at.asc()
    ).all()
    return render_template("day_view.html", day_name=day_name, workouts=workouts)


@app.route("/add", methods=["GET", "POST"])
@login_required
def add_workout():
    if request.method == "POST":
        try:
            date_str = request.form.get("date")
            exercise = request.form.get("exercise", "").strip()
            exercise_id = request.form.get("exercise_id", "").strip() or None
            sets = request.form.get("sets", "").strip()
            reps = request.form.get("reps", "").strip()
            weight = request.form.get("weight", "").strip()
            notes = request.form.get("notes", "").strip()
            day = request.form.get("day") or None

            if not exercise:
                flash("✗ Inserisci il nome dell'esercizio.", "danger")
                return redirect(url_for("add_workout"))

            if exercise_id and exercise_id not in EXERCISES_BY_ID:
                exercise_id = None

            try:
                date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.utcnow().date()
            except ValueError:
                flash("✗ Formato data non valido. Usa YYYY-MM-DD.", "danger")
                return redirect(url_for("add_workout"))

            position = None
            if day:
                max_pos = db.session.query(func.max(Workout.position)).filter(
                    Workout.day == day, Workout.user_id == current_user.id
                ).scalar()
                position = (max_pos or 0) + 1

            workout = Workout(
                user_id=current_user.id,
                date=date,
                exercise=exercise,
                exercise_id=exercise_id,
                sets=int(sets) if sets and sets.isdigit() else None,
                reps=reps if reps else None,
                weight=weight if weight else None,
                notes=notes if notes else None,
                day=day,
                position=position
            )
            db.session.add(workout)
            db.session.flush()

            if weight:
                log_weight(workout, weight)

            db.session.commit()
            flash("✓ Allenamento aggiunto.", "success")
            return redirect(url_for("dashboard"))
        
        except Exception as e:
            db.session.rollback()
            print(f"Add workout error: {e}")
            flash(f"✗ Errore: {str(e)}", "danger")
            return redirect(url_for("add_workout"))

    default_date = datetime.utcnow().date().isoformat()
    return render_template("add_workout.html", default_date=default_date)


@app.route("/workout/<int:workout_id>")
@login_required
def view_workout(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        flash("Non hai accesso a questo workout.", "danger")
        return redirect(url_for("dashboard"))
    exercise_detail = None
    if w.exercise_id:
        ex = EXERCISES_BY_ID.get(w.exercise_id)
        if ex:
            exercise_detail = dict(ex)
            exercise_detail["name_it"] = get_exercise_name_it(ex)
            exercise_detail["body_part_it"] = get_body_part_it(ex.get("body_part", ""))
            exercise_detail["target_it"] = get_target_it(ex.get("target", ""))
            exercise_detail["equipment_it"] = get_equipment_it(ex.get("equipment", ""))
    return render_template("view_workout.html", w=w, exercise_detail=exercise_detail)


@app.route("/edit/<int:workout_id>", methods=["GET", "POST"])
@login_required
def edit_workout(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        flash("✗ Non hai accesso a questo workout.", "danger")
        return redirect(url_for("dashboard"))
    
    if request.method == "POST":
        try:
            old_day = w.day
            old_position = w.position

            date_str = request.form.get("date")
            exercise = request.form.get("exercise", "").strip()
            exercise_id = request.form.get("exercise_id", "").strip() or None
            sets = request.form.get("sets", "").strip()
            reps = request.form.get("reps", "").strip()
            weight = request.form.get("weight", "").strip()
            notes = request.form.get("notes", "").strip()
            day = request.form.get("day") or None

            if not exercise:
                flash("✗ Inserisci il nome dell'esercizio.", "danger")
                return redirect(url_for("edit_workout", workout_id=workout_id))

            if exercise_id and exercise_id not in EXERCISES_BY_ID:
                exercise_id = None

            try:
                w.date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else w.date
            except ValueError:
                flash("✗ Formato data non valido. Usa YYYY-MM-DD.", "danger")
                return redirect(url_for("edit_workout", workout_id=workout_id))

            w.exercise = exercise
            w.exercise_id = exercise_id
            w.sets = int(sets) if sets and sets.isdigit() else None
            w.reps = reps if reps else None
            old_weight = w.weight
            w.weight = weight if weight else None
            w.notes = notes if notes else None

            if weight and weight != old_weight:
                log_weight(w, weight)

            if day != old_day:
                if old_day:
                    to_shift = Workout.query.filter(
                        Workout.day == old_day, Workout.position > (old_position or 0), Workout.user_id == current_user.id
                    ).all()
                    for r in to_shift:
                        r.position = (r.position or 0) - 1
                if day:
                    max_pos = db.session.query(func.max(Workout.position)).filter(
                        Workout.day == day, Workout.user_id == current_user.id
                    ).scalar()
                    w.position = (max_pos or 0) + 1
                else:
                    w.position = None
                w.day = day

            db.session.commit()
            flash("✓ Allenamento aggiornato.", "success")
            return redirect(url_for("view_workout", workout_id=workout_id))
        
        except Exception as e:
            db.session.rollback()
            print(f"Edit workout error: {e}")
            flash(f"✗ Errore: {str(e)}", "danger")
            return redirect(url_for("edit_workout", workout_id=workout_id))

    return render_template("edit_workout.html", w=w, exercise_id=w.exercise_id or "")


@app.route("/delete/<int:workout_id>", methods=["POST"])
@login_required
def delete_workout(workout_id):
    try:
        w = Workout.query.get_or_404(workout_id)
        if w.user_id != current_user.id:
            flash("✗ Non hai accesso a questo workout.", "danger")
            return redirect(url_for("dashboard"))
        
        day = w.day
        pos = w.position
        db.session.delete(w)
        db.session.commit()
        
        if day and pos:
            to_shift = Workout.query.filter(
                Workout.day == day, Workout.position > pos, Workout.user_id == current_user.id
            ).all()
            for r in to_shift:
                r.position = (r.position or 0) - 1
            db.session.commit()
        
        flash("✓ Allenamento cancellato.", "info")
    except Exception as e:
        db.session.rollback()
        print(f"Delete workout error: {e}")
        flash(f"✗ Errore durante la cancellazione: {str(e)}", "danger")
    
    return redirect(url_for("dashboard"))


@app.route("/update-weight/<int:workout_id>", methods=["POST"])
@login_required
def update_weight(workout_id):
    try:
        w = Workout.query.get_or_404(workout_id)
        if w.user_id != current_user.id:
            flash("Non hai accesso a questo workout.", "danger")
            return redirect(url_for("dashboard"))
        
        weight = request.form.get("weight", "").strip()
        old_weight = w.weight
        w.weight = weight if weight else None

        if weight and weight != old_weight:
            log_weight(w, weight)

        db.session.commit()
        
        flash(f"Peso aggiornato a {weight} kg", "success")
    except Exception as e:
        db.session.rollback()
        print(f"Update weight error: {e}")
        flash(f"Errore: {str(e)}", "danger")
    
    return redirect(request.referrer or url_for("day_view", day_name=w.day))


@app.route("/reorder-days-batch", methods=["POST"])
@login_required
def reorder_days_batch():
    """Riordina i giorni con scorrimento corretto"""
    try:
        data = request.get_json()
        mapping = data.get('mapping', {})  # Es: {'Day3': 'Day1', 'Day1': 'Day2', 'Day2': 'Day3', ...}
        
        # Salva temporaneamente tutti i workout per ogni giorno
        days_backup = {}
        for day in ["Day1", "Day2", "Day3", "Day4", "Day5"]:
            workouts = Workout.query.filter_by(day=day, user_id=current_user.id).all()
            if workouts:
                days_backup[day] = workouts
        
        # Applica la nuova mappatura usando il backup
        for old_day, new_day in mapping.items():
            if old_day in days_backup:
                workouts = days_backup[old_day]
                for wo in workouts:
                    wo.day = new_day
        
        db.session.commit()
        
        return {'success': True, 'message': 'Giorni riordinati correttamente'}, 200
    
    except Exception as e:
        db.session.rollback()
        print(f"Reorder days error: {e}")
        return {'success': False, 'error': str(e)}, 400


# ============= ROUTES STATS =============

@app.route("/stats")
@login_required
def stats():
    days = ["Day1", "Day2", "Day3", "Day4", "Day5"]
    day_stats = {}
    for d in days:
        workouts = Workout.query.filter_by(day=d, user_id=current_user.id).order_by(Workout.position.asc()).all()
        exercises = []
        for wo in workouts:
            latest = WeightHistory.query.filter_by(workout_id=wo.id, user_id=current_user.id).order_by(WeightHistory.date.desc(), WeightHistory.id.desc()).first()
            pr = WeightHistory.query.filter_by(workout_id=wo.id, user_id=current_user.id).order_by(WeightHistory.weight.desc()).first()
            count = WeightHistory.query.filter_by(workout_id=wo.id, user_id=current_user.id).count()
            name_it = wo.exercise
            if wo.exercise_id:
                ex_data = EXERCISES_BY_ID.get(wo.exercise_id)
                if ex_data:
                    name_it = get_exercise_name_it(ex_data)
            exercises.append({
                "workout": wo,
                "name_it": name_it,
                "latest_weight": latest.weight if latest else None,
                "latest_date": latest.date if latest else None,
                "pr_weight": pr.weight if pr else None,
                "pr_date": pr.date if pr else None,
                "total_entries": count,
            })
        day_stats[d] = exercises
    return render_template("stats.html", day_stats=day_stats, days=days, now_date=datetime.utcnow().date().isoformat())


@app.route("/api/weight-history/<int:workout_id>")
@login_required
def get_weight_history(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    entries = WeightHistory.query.filter_by(
        workout_id=workout_id, user_id=current_user.id
    ).order_by(WeightHistory.date.asc(), WeightHistory.id.asc()).all()
    return jsonify([{
        "id": e.id,
        "weight": e.weight,
        "date": e.date.isoformat(),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    } for e in entries])


@app.route("/api/weight-history/<int:workout_id>", methods=["POST"])
@login_required
def add_weight_entry(workout_id):
    w = Workout.query.get_or_404(workout_id)
    if w.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    data = request.get_json()
    weight = data.get("weight")
    date_str = data.get("date")
    if not weight:
        return jsonify({"error": "Peso mancante"}), 400
    try:
        w_val = float(str(weight).replace(",", "."))
    except ValueError:
        return jsonify({"error": "Peso non valido"}), 400
    try:
        entry_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.utcnow().date()
    except ValueError:
        entry_date = datetime.utcnow().date()
    entry = WeightHistory(workout_id=workout_id, user_id=current_user.id, weight=w_val, date=entry_date)
    db.session.add(entry)
    w.weight = str(w_val)
    db.session.commit()
    return jsonify({"id": entry.id, "weight": entry.weight, "date": entry.date.isoformat()}), 201


@app.route("/api/weight-history/entry/<int:entry_id>", methods=["PUT"])
@login_required
def update_weight_entry(entry_id):
    entry = WeightHistory.query.get_or_404(entry_id)
    if entry.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    data = request.get_json()
    if "weight" in data:
        try:
            entry.weight = float(str(data["weight"]).replace(",", "."))
        except ValueError:
            return jsonify({"error": "Peso non valido"}), 400
    if "date" in data:
        try:
            entry.date = datetime.strptime(data["date"], "%Y-%m-%d").date()
        except ValueError:
            pass
    w = Workout.query.get(entry.workout_id)
    if w:
        w.weight = str(entry.weight)
    db.session.commit()
    return jsonify({"id": entry.id, "weight": entry.weight, "date": entry.date.isoformat()})


@app.route("/api/weight-history/entry/<int:entry_id>", methods=["DELETE"])
@login_required
def delete_weight_entry(entry_id):
    entry = WeightHistory.query.get_or_404(entry_id)
    if entry.user_id != current_user.id:
        return jsonify({"error": "Non hai accesso"}), 403
    workout_id = entry.workout_id
    db.session.delete(entry)
    db.session.commit()
    latest = WeightHistory.query.filter_by(workout_id=workout_id, user_id=current_user.id).order_by(WeightHistory.date.desc(), WeightHistory.id.desc()).first()
    w = Workout.query.get(workout_id)
    if w:
        w.weight = str(latest.weight) if latest else None
        db.session.commit()
    return jsonify({"success": True})


# ============= HELPER =============

def url_has_allowed_host_and_scheme(url, allowed_hosts=None):
    from urllib.parse import urlparse, urljoin
    if allowed_hosts is None:
        allowed_hosts = [request.host]
    ref_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, url))
    return test_url.scheme in ('http', 'https') and test_url.netloc in allowed_hosts


_db_initialized = False


@app.before_request
def init_db_once():
    global _db_initialized
    if not _db_initialized:
        ensure_database()
        load_exercises()
        _db_initialized = True


if __name__ == "__main__":
    with app.app_context():
        ensure_database()
        load_exercises()
    app.run(debug=True)