from flask import Blueprint, request, jsonify
from app.extensions import supabase, supabase_auth
from app.services.pending_enrollments import claim_pending_enrollments

auth_bp = Blueprint('auth', __name__)


def _register_user(role):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    email = data.get('email')
    password = data.get('password')
    display_name = data.get('display_name')
#这里是后端正在接受前端发来的注册信息，因为后端要先拿到信息才能注册所以要用到.get用法#

    if not email or not password or not display_name:
        return jsonify({'error': 'Please provide all information'}), 400
    try:
        auth_response = supabase_auth.auth.sign_up({
            'email': email,
            'password': password
        })
        #把邮箱和密码传给supabase的auth工具 让它帮我们注册#

        if not auth_response.user:
            return jsonify({'error': 'Failed to create account, please try again or later'}), 400
        
        if not auth_response.session:
            return jsonify({'error': 'Email already registered, please use another email'}), 409
        
        if role not in ['teacher', 'student']:
            return jsonify({'error': 'Invalid role'}), 400
        
        user_id = auth_response.user.id

        try:
            user_payload = {
                'id': user_id,
                'email': email,
                'display_name': display_name,
                'role': role,
            }
            if role == 'student':
                grade = (data.get('grade') or '').strip()
                if grade:
                    user_payload['grade'] = grade
            supabase.table('users').insert(user_payload).execute()
        except Exception as ab_error:
            supabase_auth.auth.admin.delete_user(user_id)
            return jsonify({'error': 'Failed to save your information, try again'}), 500

        if role == 'student':
            claim_pending_enrollments(user_id, email)
        
        return jsonify({
            'message': f'{role.capitalize()} registered successfully'
        }), 201

    except Exception as auth_error:
        return jsonify({'error': str(auth_error)}), 400


@auth_bp.route('/api/auth/register/teacher', methods=['POST'])
def register_teacher():
    return _register_user('teacher')

@auth_bp.route('/api/auth/register/student', methods=['POST'])
def register_student():
    return _register_user('student')


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    email = data.get('email')
    password = data.get('password')
    #从数据里面取出邮箱和密码#

    if not email or not password:
        return jsonify({'error': 'Please provide both email and password'}), 400
    try:
        auth_response = supabase_auth.auth.sign_in_with_password({
            'email': email,
            'password': password
        })
        #把邮箱和密码传给supabase的auth工具 让它帮我们验证，跟注册不一样，注册时sign_up 登陆时用sign_in_with_password#
        if not auth_response.user:
            return jsonify({'error':'Invalid email or password'}), 401
        user_id = auth_response.user.id
        token = auth_response.session.access_token
        #从登陆结果中取出用户的唯一ID 和JWT token 用于验证身份#

        user_data = supabase.table('users').select('*').eq('id', user_id).execute()
        #去user表里面取出所有的字段让id等于user_id的用户数据并且执行查询#
        if not user_data.data:
            return jsonify({'error': 'User data not found'}), 404
        
        user = user_data.data[0]
        from app.blueprints.users import _resolve_avatar_url

        return jsonify({
            'token': token,
            'user': {
                'id': user_id,
                'email':email,
                'display_name': user['display_name'],
                'role':user['role'],
                'avatar_url': _resolve_avatar_url(user.get('avatar_url')),
            }
        }), 200
    except Exception as e:
        return jsonify({'error': 'Invalid email or password'}), 401
     #登录成功的话返回token和用户信息给前端，登录失败的话统一返回401错误#


def _oauth_display_name(auth_user):
    metadata = auth_user.user_metadata or {}
    email = auth_user.email or ''
    return (
        metadata.get('full_name')
        or metadata.get('name')
        or (email.split('@')[0] if email else None)
        or 'User'
    )


def _user_login_payload(user_id, email, user_row, token):
    from app.blueprints.users import _resolve_avatar_url

    return {
        'status': 'ok',
        'token': token,
        'user': {
            'id': user_id,
            'email': email,
            'display_name': user_row['display_name'],
            'role': user_row['role'],
            'avatar_url': _resolve_avatar_url(user_row.get('avatar_url')),
        },
    }


def _oauth_avatar_url(auth_user):
    metadata = auth_user.user_metadata or {}
    return metadata.get('avatar_url') or metadata.get('picture')


def _maybe_backfill_google_avatar(user_id, user_row, auth_user):
    if user_row.get('avatar_url'):
        return user_row
    google_avatar = _oauth_avatar_url(auth_user)
    if not google_avatar:
        return user_row
    try:
        result = supabase.table('users').update({
            'avatar_url': google_avatar,
        }).eq('id', user_id).execute()
        if result.data:
            return result.data[0]
    except Exception:
        pass
    user_row['avatar_url'] = google_avatar
    return user_row


@auth_bp.route('/api/auth/oauth/complete', methods=['POST'])
def oauth_complete():
    """Validate a Supabase OAuth access token and return app user or needs_profile."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    token = data.get('access_token')
    if not token:
        return jsonify({'error': 'No token provided'}), 400

    try:
        auth_response = supabase_auth.auth.get_user(token)
        if not auth_response or not auth_response.user:
            return jsonify({'error': 'Invalid token'}), 401

        auth_user = auth_response.user
        user_id = auth_user.id
        email = auth_user.email or ''

        user_data = supabase.table('users').select('*').eq('id', user_id).execute()
        if user_data.data:
            user = _maybe_backfill_google_avatar(
                user_id, user_data.data[0], auth_user
            )
            return jsonify(_user_login_payload(
                user_id, email, user, token
            )), 200

        metadata = auth_user.user_metadata or {}
        return jsonify({
            'status': 'needs_profile',
            'token': token,
            'email': email,
            'suggested_display_name': _oauth_display_name(auth_user),
            'avatar_url': _oauth_avatar_url(auth_user),
        }), 200
    except Exception:
        return jsonify({'error': 'Authentication failed'}), 401


@auth_bp.route('/api/auth/oauth/register', methods=['POST'])
def oauth_register():
    """Create users row for a first-time Google OAuth sign-in."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    token = data.get('access_token')
    role = data.get('role')
    display_name = (data.get('display_name') or '').strip()
    avatar_url = (data.get('avatar_url') or '').strip() or None

    if not token or not role or not display_name:
        return jsonify({'error': 'Please provide token, role, and display name'}), 400

    if role not in ['teacher', 'student']:
        return jsonify({'error': 'Invalid role'}), 400

    try:
        auth_response = supabase_auth.auth.get_user(token)
        if not auth_response or not auth_response.user:
            return jsonify({'error': 'Invalid token'}), 401

        auth_user = auth_response.user
        user_id = auth_user.id
        email = auth_user.email

        if not email:
            return jsonify({'error': 'Google account has no email address'}), 400

        existing = supabase.table('users').select('*').eq('id', user_id).execute()
        if existing.data:
            return jsonify(_user_login_payload(
                user_id, email, existing.data[0], token
            )), 200

        payload = {
            'id': user_id,
            'email': email,
            'display_name': display_name,
            'role': role,
        }
        if avatar_url:
            payload['avatar_url'] = avatar_url

        if role == 'student':
            grade = (data.get('grade') or '').strip()
            if grade:
                payload['grade'] = grade

        try:
            supabase.table('users').insert(payload).execute()
        except Exception as insert_err:
            err_text = str(insert_err).lower()
            if avatar_url and 'avatar_url' in err_text:
                supabase.table('users').insert({
                    'id': user_id,
                    'email': email,
                    'display_name': display_name,
                    'role': role,
                }).execute()
            else:
                raise insert_err

        if role == 'student':
            claim_pending_enrollments(user_id, email)

        from app.blueprints.users import _resolve_avatar_url

        return jsonify({
            'status': 'ok',
            'token': token,
            'user': {
                'id': user_id,
                'email': email,
                'display_name': display_name,
                'role': role,
                'avatar_url': _resolve_avatar_url(avatar_url),
            },
        }), 201
    except Exception as e:
        message = str(e).strip() or 'Failed to complete Google sign-in'
        return jsonify({'error': message}), 500



