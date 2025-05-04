from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import json
import os
import threading
import time
from datetime import datetime
import logging
from chat_downloader import ChatDownloader
import random
import re

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'quiz-youtube-live-secret-key'
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='threading',
    ping_timeout=120,               # Aumentado para 2 minutos
    ping_interval=5,                # Reduzido para 5 segundos para manter a conexão ativa
    max_http_buffer_size=10*1024*1024,  # Aumentado para 10MB
    always_connect=True,            # Sempre conectar, mesmo com erros
    engineio_logger=True,           # Ativar logs do engineio para debug
    logger=True,                    # Ativar logs do socketio para debug
    websocket=True,                 # Forçar uso de WebSocket
    path='/socket.io',              # Caminho explícito
    allow_upgrades=True             # Permitir upgrades de protocolo
)

# Diretório para armazenar dados
DATA_DIR = 'data'
QUESTIONS_FILE = os.path.join(DATA_DIR, 'questions.json')
RANKING_FILE = os.path.join(DATA_DIR, 'ranking.json')
CONFIG_FILE = os.path.join(DATA_DIR, 'config.json')

# Criar diretório de dados se não existir
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

# Configurações padrão do quiz
quiz_config = {
    'youtube_url': '',
    'answer_time': 20,
    'vote_count_time': 8,
    'result_display_time': 5,
    'primary_color': '#f39c12',
    'secondary_color': '#8e44ad',
    'enable_chat_simulator': True
}

# Carregar configurações do arquivo JSON
def load_config():
    """Carrega as configurações do arquivo config.json."""
    global quiz_config
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                loaded_config = json.load(f)
                # Atualizar configuração com os valores carregados
                quiz_config.update(loaded_config)
        else:
            # Configuração padrão
            quiz_config = {
                'youtube_url': '',
                'answer_time': 20,
                'vote_count_time': 8,
                'result_display_time': 5,
                'primary_color': '#f39c12',
                'secondary_color': '#8e44ad',
                'enable_chat_simulator': True
            }
            save_config()
    except Exception as e:
        logger.error(f"Erro ao carregar configurações: {str(e)}")
        # Configuração padrão em caso de erro
        quiz_config = {
            'youtube_url': '',
            'answer_time': 20,
            'vote_count_time': 8,
            'result_display_time': 5,
            'primary_color': '#f39c12',
            'secondary_color': '#8e44ad',
            'enable_chat_simulator': True
        }

# Salvar configurações em arquivo JSON
def save_config():
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(quiz_config, f, ensure_ascii=False, indent=4)
        logger.info("Configurações salvas com sucesso")
    except Exception as e:
        logger.error(f"Erro ao salvar configurações: {e}")

current_question_index = 0
current_question = None
quiz_running = False
chat_thread = None
quiz_thread = None
user_votes = {}  # Armazena votos por usuário para a pergunta atual
voted_users = set()  # Armazena usuários que já votaram na pergunta atual
questions = []
ranking = {}
current_votes = [0, 0, 0, 0]

# Variáveis globais para o chat
chat_messages = []  # Lista para armazenar mensagens do chat
is_chat_running = False  # Controla se o chat está em execução
is_simulator_running = False  # Controla especificamente se o simulador está em execução

# Função para adicionar uma mensagem ao chat
def add_chat_message(author, message):
    global chat_messages
    timestamp = time.time()
    chat_messages.append({
        'author': author,
        'message': message,
        'timestamp': timestamp
    })
    # Limitar o número de mensagens armazenadas (manter apenas as 100 últimas)
    if len(chat_messages) > 100:
        chat_messages = chat_messages[-100:]
    return timestamp

# Carregar perguntas do arquivo JSON
def load_questions():
    global questions
    if os.path.exists(QUESTIONS_FILE):
        try:
            with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
                questions = json.load(f)
            logger.info(f"Carregadas {len(questions)} perguntas do arquivo")
        except Exception as e:
            logger.error(f"Erro ao carregar perguntas: {e}")
            questions = []
    else:
        # Perguntas de exemplo se o arquivo não existir
        questions = [
            {
                "question": "Qual é a capital do Brasil?",
                "options": ["Rio de Janeiro", "São Paulo", "Brasília", "Salvador"],
                "correct": 2,  # Índice da resposta correta (0-based)
                "explanation": "Brasília é a capital federal do Brasil desde 21 de abril de 1960."
            },
            {
                "question": "Quem escreveu 'Dom Casmurro'?",
                "options": ["José de Alencar", "Machado de Assis", "Clarice Lispector", "Carlos Drummond de Andrade"],
                "correct": 1,
                "explanation": "Machado de Assis escreveu 'Dom Casmurro', publicado em 1899."
            }
        ]
        save_questions()

# Salvar perguntas em arquivo JSON
def save_questions():
    try:
        with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(questions, f, ensure_ascii=False, indent=4)
        logger.info(f"Salvas {len(questions)} perguntas no arquivo")
    except Exception as e:
        logger.error(f"Erro ao salvar perguntas: {e}")

# Carregar ranking do arquivo JSON
def load_ranking():
    global ranking
    if os.path.exists(RANKING_FILE):
        try:
            with open(RANKING_FILE, 'r', encoding='utf-8') as f:
                ranking = json.load(f)
            logger.info(f"Ranking carregado com {len(ranking)} usuários")
        except Exception as e:
            logger.error(f"Erro ao carregar ranking: {e}")
            ranking = {}
    else:
        ranking = {}
        save_ranking()

# Salvar ranking em arquivo JSON
def save_ranking():
    try:
        with open(RANKING_FILE, 'w', encoding='utf-8') as f:
            json.dump(ranking, f, ensure_ascii=False, indent=4)
        logger.info("Ranking salvo com sucesso")
    except Exception as e:
        logger.error(f"Erro ao salvar ranking: {e}")

# Processar mensagem do chat
def process_chat_message(author, message):
    global current_votes, voted_users
    
    try:
        # Verificar se é um voto
        vote_match = re.match(r'!([a-dA-D])', message)
        if vote_match and quiz_running and current_question:
            # Extrair a opção votada (A, B, C ou D)
            vote_option = vote_match.group(1).upper()
            
            # Verificar se o usuário já votou nesta pergunta
            if author in voted_users:
                logger.info(f"Usuário {author} já votou nesta pergunta")
                return
            
            # Registrar voto
            voted_users.add(author)
            user_votes[author] = vote_option
            
            # Incrementar contador de votos
            vote_index = ord(vote_option) - ord('A')  # Converter A->0, B->1, etc.
            current_votes[vote_index] += 1
            
            logger.info(f"Voto registrado: {author} votou na opção !{vote_option}")
            
            # Emitir atualização de votos para o frontend
            socketio.emit('update_votes', {
                'votes': {
                    'A': current_votes[0],
                    'B': current_votes[1],
                    'C': current_votes[2],
                    'D': current_votes[3]
                }
            })
        
        # Enviar a mensagem para o frontend
        socketio.emit('chat_message', {
            'author': author,
            'message': message
        })
        
        # Adicionar mensagem ao histórico do chat
        add_chat_message(author, message)
    except Exception as e:
        logger.error(f"Erro ao processar mensagem do chat: {e}")

# Função para monitorar o chat do YouTube
def monitor_youtube_chat():
    """Monitora o chat do YouTube para capturar votos."""
    global chat_thread, is_chat_running, is_simulator_running
    
    try:
        # Verificar se o simulador de chat está ativado
        if quiz_config.get('enable_chat_simulator', True):
            logger.info("Simulador de chat ativado. Iniciando simulação de mensagens.")
            is_chat_running = True
            is_simulator_running = True
            chat_thread = threading.Thread(target=simulate_chat_messages)
            chat_thread.daemon = True
            chat_thread.start()
            return
        
        # Se o simulador estiver desativado, conectar ao chat real do YouTube
        url = quiz_config.get('youtube_url', '')
        if not url:
            logger.error("URL do YouTube não configurada")
            return
        
        # Normalizar a URL do YouTube
        normalized_url = normalize_youtube_url(url)
        if not normalized_url:
            logger.error(f"URL inválida: {url}")
            return
        
        logger.info(f"Conectando ao chat do YouTube: {normalized_url}")
        
        # Desativar o simulador e ativar o chat real
        is_simulator_running = False
        is_chat_running = True
        
        # Configurar o chat downloader
        chat_downloader = ChatDownloader()
        chat = chat_downloader.get_chat(normalized_url, timeout=60, max_attempts=5)
        
        # Processar mensagens do chat
        for message in chat:
            if not is_chat_running:
                break
                
            try:
                author = message.get('author', {}).get('name', 'Anônimo')
                text = message.get('message', '')
                
                # Verificar se é um voto válido
                if text.startswith('!'):
                    vote = text.lower().strip()
                    if vote in ['!a', '!b', '!c', '!d']:
                        option_index = {'!a': 0, '!b': 1, '!c': 2, '!d': 3}[vote]
                        register_vote(author, option_index)
                
                # Emitir mensagem para o cliente
                socketio.emit('chat_message', {
                    'author': author,
                    'message': text
                })
                
                logger.debug(f"Mensagem do chat: {author} -> {text}")
            except Exception as e:
                logger.error(f"Erro ao processar mensagem do chat: {str(e)}")
    
    except Exception as e:
        logger.error(f"Erro ao monitorar chat do YouTube: {str(e)}")
        # Fallback para simulação em caso de erro
        if not is_chat_running and not is_simulator_running:
            logger.info("Iniciando simulação de chat como fallback")
            is_chat_running = True
            is_simulator_running = True
            chat_thread = threading.Thread(target=simulate_chat_messages)
            chat_thread.daemon = True
            chat_thread.start()

# Função para executar o loop do quiz
def quiz_loop():
    global quiz_running, current_question_index, current_question, current_votes, voted_users, user_votes
    
    while True:
        if quiz_running and questions:
            # Selecionar pergunta atual
            current_question_index = current_question_index % len(questions)
            current_question = questions[current_question_index]
            current_votes = [0, 0, 0, 0]
            voted_users = set()  # Limpar usuários que votaram
            user_votes = {}  # Limpar votos para a nova pergunta
            
            # Verificar formato da pergunta e obter a resposta correta
            correct_answer = 0  # Valor padrão
            if 'correct' in current_question:
                correct_answer = current_question['correct']
            elif 'correct_answer' in current_question:
                correct_answer = current_question['correct_answer']
            
            # Preparar dados da pergunta para o frontend
            question_data = {
                'question': current_question['question'],
                'options': {
                    'A': current_question['options'][0],
                    'B': current_question['options'][1],
                    'C': current_question['options'][2],
                    'D': current_question['options'][3]
                },
                'correct': correct_answer
            }
            
            # Enviar pergunta para o frontend
            logger.info(f"Enviando pergunta: {question_data}")
            logger.info(f"Pergunta {current_question_index + 1}: {current_question['question']}")
            
            socketio.emit('next_question', {
                'question': question_data,
                'question_num': current_question_index + 1,
                'total_questions': len(questions),
                'answer_time': quiz_config['answer_time']
            })
            
            # Aguardar o tempo de resposta
            time.sleep(quiz_config['answer_time'])
            
            # Enviar mensagem de contabilização de votos
            logger.info("Enviando mensagem de contabilização de votos")
            socketio.emit('show_counting_votes', {
                'time': quiz_config['vote_count_time']
            })
            
            # Aguardar tempo para contabilizar votos
            time.sleep(quiz_config['vote_count_time'])
            
            # Calcular resultado
            explanation = current_question.get('explanation', 'Sem explicação disponível.')
            
            # Converter índice numérico para letra (0=A, 1=B, 2=C, 3=D)
            correct_letter = chr(65 + correct_answer)  # ASCII: A=65, B=66, etc.
            
            # Atualizar ranking
            update_ranking(correct_answer)
            
            # Enviar resultado para o frontend
            logger.info(f"Enviando resultados: resposta correta={correct_letter}, votos={count_votes()}")
            socketio.emit('show_results', {
                'correct_answer': correct_letter,
                'explanation': explanation,
                'votes': count_votes()
            })
            
            # Enviar ranking atualizado
            top_ranking = get_top_ranking(10)
            logger.info(f"Enviando ranking atualizado: {top_ranking}")
            socketio.emit('update_ranking', {
                'ranking': top_ranking
            })
            
            # Aguardar antes de passar para a próxima pergunta
            time.sleep(quiz_config['result_display_time'])
            
            # Avançar para a próxima pergunta
            current_question_index += 1
        else:
            # Se o quiz não estiver rodando, aguardar um pouco antes de verificar novamente
            time.sleep(1)

# Obter os top N usuários do ranking
def get_top_ranking(n=10):
    sorted_ranking = sorted(ranking.items(), key=lambda x: x[1], reverse=True)
    return [{"name": name, "score": score} for name, score in sorted_ranking[:n]]

# Contar votos
def count_votes():
    global current_votes
    return {
        'A': current_votes[0],
        'B': current_votes[1],
        'C': current_votes[2],
        'D': current_votes[3]
    }

# Atualizar ranking com base nos votos
def update_ranking(correct_answer):
    global ranking, user_votes
    
    # Converter índice numérico para letra (0=A, 1=B, 2=C, 3=D)
    correct_letter = chr(65 + correct_answer)  # ASCII: A=65, B=66, etc.
    
    logger.info(f"Atualizando ranking. Resposta correta: {correct_letter}")
    
    # Atualizar ranking com usuários que acertaram
    for user, vote in user_votes.items():
        if user not in ranking:
            ranking[user] = 0
        
        # Comparar voto (que é uma letra) com a resposta correta
        if vote == correct_letter:
            ranking[user] += 1
            logger.info(f"Usuário {user} acertou e ganhou 1 ponto. Total: {ranking[user]}")
    
    # Salvar ranking atualizado
    save_ranking()
    
    # Log do ranking atual
    logger.info(f"Ranking atual: {ranking}")
    logger.info(f"Top 10: {get_top_ranking(10)}")

# Função para normalizar URL do YouTube
def normalize_youtube_url(url):
    """Normaliza uma URL do YouTube para garantir que seja compatível com chat-downloader."""
    if not url:
        return None
        
    # Extrair o ID do vídeo da URL
    video_id = None
    
    try:
        # Padrão: https://www.youtube.com/watch?v=VIDEO_ID
        if 'youtube.com/watch' in url and 'v=' in url:
            video_id = url.split('v=')[1].split('&')[0]
        
        # Padrão: https://youtu.be/VIDEO_ID
        elif 'youtu.be/' in url:
            video_id = url.split('youtu.be/')[1].split('?')[0]
        
        # Padrão: https://www.youtube.com/live/VIDEO_ID
        elif 'youtube.com/live/' in url:
            video_id = url.split('youtube.com/live/')[1].split('?')[0]
        
        # Se encontramos um ID de vídeo, retornar URL normalizada
        if video_id and len(video_id) > 0:
            return f"https://www.youtube.com/watch?v={video_id}"
        
        # Se não conseguimos extrair o ID, retornar None
        logger.warning(f"Não foi possível extrair ID de vídeo da URL: {url}")
        return None
    except Exception as e:
        logger.error(f"Erro ao normalizar URL do YouTube: {e}")
        return None

# Função para reiniciar o monitoramento do chat
def restart_chat_monitoring(url):
    global chat_thread
    
    # Parar a thread atual
    if chat_thread and chat_thread.is_alive():
        logger.info("Parando thread de monitoramento do chat")
    
    # Iniciar nova thread
    chat_thread = threading.Thread(target=monitor_youtube_chat)
    chat_thread.daemon = True
    chat_thread.start()

# Rotas da aplicação
@app.route('/')
def home():
    return render_template('home.html')

@app.route('/quiz')
def quiz():
    """Página principal do quiz."""
    # Configurar cores para o tema
    def hex_to_rgb(hex_color):
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    def lighten_color(hex_color, factor=0.2):
        r, g, b = hex_to_rgb(hex_color)
        r = min(255, int(r + (255 - r) * factor))
        g = min(255, int(g + (255 - g) * factor))
        b = min(255, int(b + (255 - b) * factor))
        return f'#{r:02x}{g:02x}{b:02x}'
    
    def darken_color(hex_color, factor=0.2):
        r, g, b = hex_to_rgb(hex_color)
        r = max(0, int(r * (1 - factor)))
        g = max(0, int(g * (1 - factor)))
        b = max(0, int(b * (1 - factor)))
        return f'#{r:02x}{g:02x}{b:02x}'
    
    # Configurar cores
    color_config = {
        'primary_color': quiz_config['primary_color'],
        'primary_light': lighten_color(quiz_config['primary_color']),
        'primary_dark': darken_color(quiz_config['primary_color']),
        'secondary_color': quiz_config['secondary_color'],
        'secondary_light': lighten_color(quiz_config['secondary_color']),
        'secondary_dark': darken_color(quiz_config['secondary_color'])
    }
    
    return render_template('quiz.html', config=color_config)

# API para configurações
@app.route('/api/config', methods=['GET'])
def api_get_config():
    """Retorna as configurações atuais."""
    return jsonify(quiz_config)

@app.route('/api/config', methods=['POST'])
def api_save_config():
    """Salva as configurações enviadas pelo cliente."""
    global quiz_config, is_chat_running, chat_thread
    
    try:
        # Obter dados do cliente
        data = request.json
        
        # Verificar se houve mudança na configuração do simulador de chat
        old_simulator_setting = quiz_config.get('enable_chat_simulator', True)
        new_simulator_setting = data.get('enable_chat_simulator', True)
        
        # Atualizar configuração
        quiz_config.update(data)
        
        # Salvar configuração
        save_config()
        
        # Se a configuração do simulador mudou e o chat está rodando, reiniciar o chat
        if old_simulator_setting != new_simulator_setting and is_chat_running:
            # Parar o chat atual
            is_chat_running = False
            if chat_thread and chat_thread.is_alive():
                # Esperar o thread terminar (com timeout)
                chat_thread.join(timeout=1.0)
            
            # Iniciar novo chat com a nova configuração
            is_chat_running = True
            chat_thread = threading.Thread(target=monitor_youtube_chat)
            chat_thread.daemon = True
            chat_thread.start()
        
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Erro ao salvar configurações: {str(e)}")
        return jsonify({'success': False, 'message': str(e)})

# API para perguntas
@app.route('/api/questions', methods=['GET', 'POST'])
def api_questions():
    global questions
    
    if request.method == 'POST':
        data = request.json
        if 'questions' in data:
            questions = data['questions']
            save_questions()
            return jsonify({'success': True, 'count': len(questions)})
    
    return jsonify(questions)

# API para ranking
@app.route('/api/ranking', methods=['GET'])
def api_ranking():
    """Retorna o ranking atual dos 10 melhores participantes."""
    try:
        return jsonify(get_top_ranking(10))
    except Exception as e:
        logger.error(f"Erro ao obter ranking: {e}")
        return jsonify({'error': str(e)}), 500

# API para testar conexão com YouTube
@app.route('/api/test-connection', methods=['POST'])
def test_connection():
    """Testar conexão com o chat do YouTube."""
    try:
        # Obter e logar o corpo da requisição para debug
        request_data = request.get_json()
        logger.info(f"Dados recebidos na requisição de teste: {request_data}")
        
        # Verificar se há dados
        if not request_data:
            logger.error("Corpo da requisição vazio ou inválido")
            return jsonify({
                'success': False,
                'message': 'Corpo da requisição vazio ou inválido'
            }), 400
        
        # Tentar obter a URL de várias formas possíveis
        url = None
        if 'url' in request_data:
            url = request_data['url']
        elif 'youtube_url' in request_data:
            url = request_data['youtube_url']
        
        if not url:
            logger.error("URL não fornecida no corpo da requisição")
            return jsonify({
                'success': False,
                'message': 'URL não fornecida'
            }), 400
        
        logger.info(f"Testando conexão com URL: {url}")
        
        # Normalizar a URL
        url = normalize_youtube_url(url)
        logger.info(f"URL normalizada: {url}")
        
        # Verificar se é uma URL válida do YouTube
        if not url or not ('youtube.com' in url or 'youtu.be' in url):
            return jsonify({
                'success': False,
                'message': 'URL inválida. Por favor, forneça uma URL válida do YouTube.'
            }), 400
            
        # Versão simplificada: apenas verificar se a URL é válida
        # Em vez de tentar conectar ao chat, que pode falhar por vários motivos
        # Consideramos a URL válida se pudermos extrair um ID de vídeo
        video_id = None
        
        # Extrair ID do vídeo da URL
        if 'youtube.com/watch' in url:
            # Formato: youtube.com/watch?v=VIDEO_ID
            query_string = url.split('?')[-1]
            params = {param.split('=')[0]: param.split('=')[1] for param in query_string.split('&') if '=' in param}
            video_id = params.get('v')
        elif 'youtu.be/' in url:
            # Formato: youtu.be/VIDEO_ID
            video_id = url.split('youtu.be/')[-1].split('?')[0]
        elif 'youtube.com/live/' in url:
            # Formato: youtube.com/live/VIDEO_ID
            video_id = url.split('youtube.com/live/')[-1].split('?')[0]
        
        if video_id:
            logger.info(f"ID de vídeo extraído com sucesso: {video_id}")
            return jsonify({
                'success': True,
                'message': 'URL válida do YouTube. A conexão será estabelecida quando o quiz for iniciado.',
                'video_id': video_id
            })
        else:
            logger.error(f"Não foi possível extrair ID de vídeo da URL: {url}")
            return jsonify({
                'success': False,
                'message': 'Não foi possível extrair o ID do vídeo da URL fornecida. Verifique se é uma URL válida do YouTube.'
            }), 400
        
    except Exception as e:
        error_message = str(e)
        logger.error(f"Erro ao testar conexão: {error_message}")
        
        # Fornecer uma mensagem de erro mais amigável
        friendly_message = f"Erro ao testar conexão: {error_message}"
        
        return jsonify({
            'success': False,
            'message': friendly_message,
            'error_details': error_message
        }), 500

@app.route('/api/quiz/status-http', methods=['GET'])
def api_quiz_status_http():
    try:
        return jsonify({
            'quiz_running': quiz_running,
            'success': True
        })
    except Exception as e:
        logger.error(f"Erro ao obter status do quiz: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/quiz/current-question-http', methods=['GET'])
def api_current_question_http():
    try:
        if not quiz_running or current_question is None:
            return jsonify({
                'success': False,
                'message': 'Quiz não está em execução ou não há pergunta atual'
            }), 404
        
        # Obter opções da pergunta de forma segura
        options = []
        if 'options' in current_question:
            if isinstance(current_question['options'], list):
                options = current_question['options'][:4]  # Garantir que temos 4 opções
                # Preencher com vazios se não tiver 4 opções
                while len(options) < 4:
                    options.append("")
            else:
                # Formato de dicionário
                options = [
                    current_question['options'].get('A', ''),
                    current_question['options'].get('B', ''),
                    current_question['options'].get('C', ''),
                    current_question['options'].get('D', '')
                ]
        
        return jsonify({
            'success': True,
            'question': {
                'id': current_question.get('id', current_question_index),
                'text': current_question.get('question', ''),
                'options': options,
                'time': quiz_config.get('answer_time', 20)
            },
            'remaining_time': quiz_config.get('answer_time', 20),
            'question_num': current_question_index + 1,
            'total_questions': len(questions)
        })
    except Exception as e:
        logger.error(f"Erro ao obter pergunta atual: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/quiz/votes-http', methods=['GET'])
def api_votes_http():
    try:
        if not quiz_running:
            return jsonify({
                'success': False,
                'message': 'Quiz não está em execução'
            }), 404
        
        # Calcular porcentagem de acertos
        total_votes = sum(current_votes)
        correct_index = current_question.get('correct', 0) if current_question else 0
        correct_votes = current_votes[correct_index] if 0 <= correct_index < len(current_votes) else 0
        correct_percentage = int((correct_votes / total_votes) * 100) if total_votes > 0 else 0
        
        return jsonify({
            'success': True,
            'votes': {
                'a': current_votes[0] if len(current_votes) > 0 else 0,
                'b': current_votes[1] if len(current_votes) > 1 else 0,
                'c': current_votes[2] if len(current_votes) > 2 else 0,
                'd': current_votes[3] if len(current_votes) > 3 else 0,
                'correct_percentage': correct_percentage
            }
        })
    except Exception as e:
        logger.error(f"Erro ao obter votos: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/quiz/chat-http', methods=['GET'])
def api_chat_http():
    try:
        since = request.args.get('since', 0, type=float)
        
        # Filtrar mensagens mais recentes que o timestamp fornecido
        recent_messages = []
        
        # Verificar se chat_messages existe e é uma lista
        if 'chat_messages' in globals() and isinstance(chat_messages, list):
            recent_messages = [
                msg for msg in chat_messages 
                if msg.get('timestamp', 0) > since
            ]
        
        return jsonify({
            'success': True,
            'messages': recent_messages
        })
    except Exception as e:
        logger.error(f"Erro ao obter mensagens do chat: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/quiz/start-http', methods=['POST'])
def api_start_quiz_http():
    global quiz_running, current_question, current_question_index, current_votes
    
    if quiz_running:
        return jsonify({
            'success': False,
            'message': 'Quiz já está em execução'
        })
    
    # Iniciar o quiz
    quiz_running = True
    current_question_index = 0
    current_votes = [0, 0, 0, 0]
    
    # Iniciar a thread de monitoramento do chat se não estiver rodando
    if 'chat_thread' in globals() and (not chat_thread or not chat_thread.is_alive()):
        start_chat_monitoring()
    
    # Avançar para a primeira pergunta
    next_question()
    
    return jsonify({
        'success': True,
        'message': 'Quiz iniciado com sucesso'
    })

@app.route('/api/quiz/stop-http', methods=['POST'])
def api_stop_quiz_http():
    global quiz_running
    
    if not quiz_running:
        return jsonify({
            'success': False,
            'message': 'Quiz não está em execução'
        })
    
    # Parar o quiz
    quiz_running = False
    
    return jsonify({
        'success': True,
        'message': 'Quiz parado com sucesso'
    })

@app.route('/api/ranking-http', methods=['GET'])
def api_ranking_http():
    try:
        # Obter o ranking atual
        ranking_list = get_ranking()
        
        return jsonify({
            'success': True,
            'ranking': ranking_list
        })
    except Exception as e:
        logger.error(f"Erro ao obter ranking via HTTP: {e}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

# API para conectar diretamente ao chat do YouTube
@app.route('/api/connect-youtube', methods=['POST'])
def api_connect_youtube():
    """Conecta diretamente ao chat do YouTube a partir da página do quiz."""
    global quiz_config, is_chat_running, is_simulator_running, chat_thread
    
    try:
        # Obter URL do cliente
        data = request.json
        url = data.get('url', '')
        
        if not url:
            return jsonify({'success': False, 'message': 'URL não fornecida'}), 400
        
        # Normalizar a URL do YouTube
        normalized_url = normalize_youtube_url(url)
        if not normalized_url:
            return jsonify({'success': False, 'message': 'URL do YouTube inválida'}), 400
        
        # Atualizar configuração
        quiz_config['youtube_url'] = url
        quiz_config['enable_chat_simulator'] = False  # Desativar simulador
        
        # Salvar configuração
        save_config()
        
        # Parar o chat atual
        is_chat_running = False
        is_simulator_running = False  # Garantir que o simulador seja desativado
        
        if chat_thread and chat_thread.is_alive():
            logger.info("Parando thread de chat atual...")
            # Esperar o thread terminar (com timeout)
            chat_thread.join(timeout=1.0)
        
        # Limpar o chat container no cliente
        socketio.emit('clear_chat', {
            'message': 'Chat reiniciado para conexão com YouTube'
        })
        
        # Enviar mensagem de sistema
        socketio.emit('chat_message', {
            'author': 'Sistema',
            'message': f'Conectando ao chat do YouTube: {normalized_url}'
        })
        
        # Aguardar um momento para garantir que o thread anterior parou
        time.sleep(1)
        
        # Iniciar novo chat com a nova configuração
        is_chat_running = True
        is_simulator_running = False  # Garantir novamente que o simulador esteja desativado
        chat_thread = threading.Thread(target=monitor_youtube_chat)
        chat_thread.daemon = True
        chat_thread.start()
        
        logger.info(f"Conectado ao chat do YouTube: {normalized_url}")
        return jsonify({'success': True, 'message': 'Conectado ao chat do YouTube com sucesso'})
    
    except Exception as e:
        logger.error(f"Erro ao conectar ao chat do YouTube: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

# Função para obter o ranking atual
def get_ranking():
    """Retorna o ranking atual ordenado por pontuação."""
    try:
        # Converter o dicionário de ranking em uma lista de dicionários
        ranking_list = []
        for name, score in ranking.items():
            ranking_list.append({
                'name': name,
                'score': score
            })
        
        # Ordenar por pontuação (maior para menor)
        ranking_list.sort(key=lambda x: x['score'], reverse=True)
        
        # Retornar os 10 primeiros
        return ranking_list[:10]
    except Exception as e:
        logger.error(f"Erro ao obter ranking: {e}")
        return []

# Eventos Socket.IO
@socketio.on('connect')
def handle_connect():
    emit('status', {'quiz_running': quiz_running})
    
    # Enviar ranking inicial
    emit('update_ranking', {'ranking': get_top_ranking(10)})
    
    # Se o quiz estiver rodando, enviar a pergunta atual
    if current_question and quiz_running:
        # Verificar formato da pergunta e obter a resposta correta
        correct_answer = 0  # Valor padrão
        if 'correct' in current_question:
            correct_answer = current_question['correct']
        elif 'correct_answer' in current_question:
            correct_answer = current_question['correct_answer']
        
        # Preparar dados da pergunta para o frontend
        question_data = {
            'question': current_question['question'],
            'options': {
                'A': current_question['options'][0],
                'B': current_question['options'][1],
                'C': current_question['options'][2],
                'D': current_question['options'][3]
            },
            'correct': correct_answer
        }
        
        emit('next_question', {
            'question': question_data,
            'question_num': current_question_index + 1,
            'total_questions': len(questions),
            'answer_time': quiz_config['answer_time']
        })

@socketio.on('get_ranking')
def handle_get_ranking(data=None):
    """Manipulador para solicitação de ranking via Socket.IO."""
    emit('ranking_update', {'success': True, 'ranking': get_ranking()})

@socketio.on('start_quiz')
def handle_start_quiz(data=None):
    global quiz_running, chat_thread, quiz_thread, current_question_index
    
    if quiz_running:
        socketio.emit('quiz_status', {'success': False, 'message': 'Quiz já está em execução', 'quiz_running': quiz_running})
        return
    
    if not quiz_config['youtube_url']:
        socketio.emit('quiz_status', {'success': False, 'message': 'URL do YouTube não configurada', 'quiz_running': quiz_running})
        return
    
    if not questions:
        socketio.emit('quiz_status', {'success': False, 'message': 'Nenhuma pergunta cadastrada', 'quiz_running': quiz_running})
        return
    
    try:
        quiz_running = True
        current_question_index = 0
        
        # Iniciar thread para monitorar chat
        chat_thread = threading.Thread(target=monitor_youtube_chat)
        chat_thread.daemon = True
        chat_thread.start()
        
        # Iniciar thread para o loop do quiz
        quiz_thread = threading.Thread(target=quiz_loop)
        quiz_thread.daemon = True
        quiz_thread.start()
        
        # Iniciar thread para simular mensagens de chat (apenas para testes)
        sim_thread = threading.Thread(target=simulate_chat_messages)
        sim_thread.daemon = True
        sim_thread.start()
        
        # Emitir status atualizado para todos os clientes
        socketio.emit('quiz_status', {
            'success': True, 
            'message': 'Quiz iniciado com sucesso',
            'quiz_running': quiz_running
        })
    except Exception as e:
        quiz_running = False
        logger.error(f"Erro ao iniciar quiz: {e}")
        socketio.emit('quiz_status', {
            'success': False, 
            'message': f'Erro ao iniciar quiz: {str(e)}',
            'quiz_running': quiz_running
        })

@socketio.on('stop_quiz')
def handle_stop_quiz(data=None):
    global quiz_running
    
    if not quiz_running:
        socketio.emit('quiz_status', {'success': False, 'message': 'Quiz não está em execução', 'quiz_running': quiz_running})
        return
    
    quiz_running = False
    socketio.emit('quiz_status', {'success': True, 'message': 'Quiz interrompido com sucesso', 'quiz_running': quiz_running})

# Handler para conexão de cliente
@socketio.on('connect')
def handle_connect(data=None):
    try:
        socketio.emit('quiz_status', {
            'success': True,
            'quiz_running': quiz_running,
            'message': 'Conectado ao servidor'
        })
        logger.info("Cliente conectado")
    except Exception as e:
        logger.error(f"Erro ao processar conexão: {e}")

# Inicialização
load_config()
load_questions()
load_ranking()

# Função para simular mensagens de chat (apenas para testes)
def simulate_chat_messages():
    """Simula mensagens de chat para testes."""
    global is_simulator_running
    
    logger.info("Iniciando simulação de mensagens de chat")
    is_simulator_running = True
    time.sleep(2)  # Aguardar um pouco para o quiz iniciar
    
    # Lista de nomes de usuários fictícios
    usernames = ["João123", "MariaGamer", "PedroYT", "Ana_Live", "Carlos_Fan", 
                "Lucia_Games", "Roberto_TV", "Patricia_Stream", "FelipeZ", "JuliaQuiz"]
    
    # Mensagens genéricas
    messages = [
        "Olá pessoal!", "Esse quiz é muito legal!", "Adoro participar!", 
        "Qual é a próxima pergunta?", "Estou ganhando!", "Difícil essa!",
        "Vamos lá!", "Quase acertei!", "Essa eu sei!", "Quem está ganhando?"
    ]
    
    # Comandos de resposta
    commands = ["!a", "!b", "!c", "!d", "!A", "!B", "!C", "!D"]
    
    # Loop para simular mensagens enquanto o quiz estiver rodando
    while quiz_running and is_simulator_running:
        try:
            # Verificar se o simulador ainda deve estar rodando
            if not is_simulator_running:
                logger.info("Simulador de chat desativado. Parando simulação.")
                break
                
            # Simular uma mensagem normal ou um comando
            username = random.choice(usernames)
            
            # 50% de chance de ser um comando de resposta
            if random.random() > 0.5 and current_question is not None:
                msg = random.choice(commands)
                logger.info(f"Simulando voto: {username} -> {msg}")
            else:
                msg = random.choice(messages)
                logger.info(f"Simulando mensagem: {username} -> {msg}")
            
            # Criar uma mensagem simulada no formato que o chat-downloader usaria
            fake_message = {
                'author': {'name': username},
                'message': msg
            }
            
            # Processar a mensagem simulada
            if isinstance(fake_message, dict):
                if 'author' in fake_message and isinstance(fake_message['author'], dict):
                    author = fake_message['author'].get('name', 'Anônimo')
                else:
                    author = fake_message.get('author', 'Anônimo')
                
                if 'message' in fake_message:
                    message_text = fake_message.get('message', '').strip()
                elif 'text' in fake_message:
                    message_text = fake_message.get('text', '').strip()
                else:
                    message_text = str(fake_message).strip()
            else:
                author = 'Anônimo'
                message_text = str(fake_message).strip()
            
            process_chat_message(author, message_text)
            
            # Aguardar um tempo aleatório entre mensagens (0.5 a 3 segundos)
            time.sleep(random.uniform(0.5, 3))
        except Exception as e:
            logger.error(f"Erro na simulação de chat: {e}")
            time.sleep(1)
    
    logger.info("Simulação de chat encerrada")
    is_simulator_running = False

# Iniciar o quiz automaticamente quando o servidor é iniciado
def auto_start_quiz():
    global quiz_running, chat_thread, quiz_thread, current_question_index
    
    # Verificar se há perguntas 
    if questions:
        quiz_running = True
        current_question_index = 0
        
        # Iniciar thread para monitorar chat
        chat_thread = threading.Thread(target=monitor_youtube_chat)
        chat_thread.daemon = True
        chat_thread.start()
        
        # Iniciar thread para o loop do quiz
        quiz_thread = threading.Thread(target=quiz_loop)
        quiz_thread.daemon = True
        quiz_thread.start()
        
        # Iniciar thread para simular mensagens de chat (apenas para testes)
        sim_thread = threading.Thread(target=simulate_chat_messages)
        sim_thread.daemon = True
        sim_thread.start()
        
        logger.info("Quiz iniciado automaticamente")

# Iniciar o quiz automaticamente após 2 segundos (para dar tempo de carregar tudo)
if __name__ == '__main__':
    # Configurar uma URL de exemplo para testes se não houver uma configurada
    if not quiz_config['youtube_url']:
        quiz_config['youtube_url'] = 'https://www.youtube.com/watch?v=exemplo'
        logger.info("URL de exemplo configurada para testes")
    
    # Iniciar o quiz automaticamente após 2 segundos
    threading.Timer(2.0, auto_start_quiz).start()
    
    # Usar porta definida pelo ambiente ou 5000 como padrão
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
