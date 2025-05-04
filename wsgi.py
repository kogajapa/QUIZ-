from app import app, socketio, auto_start_quiz, quiz_config, logger
import threading

# Configurar uma URL de exemplo para testes se não houver uma configurada
if not quiz_config['youtube_url']:
    quiz_config['youtube_url'] = 'https://www.youtube.com/watch?v=exemplo'
    logger.info("URL de exemplo configurada para testes")

# Iniciar o quiz automaticamente após 2 segundos
threading.Timer(2.0, auto_start_quiz).start()

if __name__ == "__main__":
    socketio.run(app)
