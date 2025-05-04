document.addEventListener('DOMContentLoaded', function() {
    // Elementos DOM
    const quizStatus = document.getElementById('quiz-status');
    const questionContainer = document.getElementById('question-container');
    const resultContainer = document.getElementById('result-container');
    const questionNumber = document.getElementById('question-number');
    const timer = document.getElementById('timer');
    const questionText = document.getElementById('question-text');
    const optionA = document.getElementById('option-a');
    const optionB = document.getElementById('option-b');
    const optionC = document.getElementById('option-c');
    const optionD = document.getElementById('option-d');
    const correctLetter = document.getElementById('correct-letter');
    const correctText = document.getElementById('correct-text');
    const rankingList = document.getElementById('ranking-list');
    const chatMessages = document.getElementById('chat-messages');

    // Variáveis globais
    let quizRunning = false;
    let countdownInterval = null;
    let currentTime = 0;
    let pollInterval = null;
    
    // Inicializar
    init();
    
    function init() {
        console.log('Inicializando quiz (versão alternativa)...');
        
        // Verificar status do quiz
        checkQuizStatus();
        
        // Configurar polling para atualizações
        setupPolling();
        
        // Carregar ranking inicial
        loadRanking();
        
        // Adicionar botões de controle
        addControlButtons();
    }
    
    // Adicionar botões de controle ao quiz
    function addControlButtons() {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'quiz-controls';
        
        const startButton = document.createElement('button');
        startButton.textContent = 'Iniciar Quiz';
        startButton.className = 'btn-start';
        startButton.onclick = startQuiz;
        
        const stopButton = document.createElement('button');
        stopButton.textContent = 'Parar Quiz';
        stopButton.className = 'btn-stop';
        stopButton.onclick = stopQuiz;
        
        controlsDiv.appendChild(startButton);
        controlsDiv.appendChild(stopButton);
        
        // Adicionar ao DOM
        if (quizStatus) {
            quizStatus.parentNode.insertBefore(controlsDiv, quizStatus);
        }
    }
    
    // Configurar polling para atualizações periódicas
    function setupPolling() {
        // Polling a cada 2 segundos
        pollInterval = setInterval(function() {
            if (quizRunning) {
                // Verificar pergunta atual
                checkCurrentQuestion();
                
                // Verificar votos
                checkVotes();
                
                // Verificar chat
                checkChat();
            }
            
            // Sempre verificar o status do quiz e o ranking
            checkQuizStatus();
            loadRanking();
        }, 2000);
    }
    
    // Verificar status do quiz
    function checkQuizStatus() {
        fetch('/api/quiz/status')
            .then(response => response.json())
            .then(data => {
                quizRunning = data.quiz_running;
                updateUI();
            })
            .catch(error => {
                console.error('Erro ao verificar status do quiz:', error);
            });
    }
    
    // Verificar pergunta atual
    function checkCurrentQuestion() {
        fetch('/api/quiz/current-question')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Quiz não está em execução ou não há pergunta atual');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showQuestion(data.question);
                }
            })
            .catch(error => {
                console.error('Erro ao verificar pergunta atual:', error);
            });
    }
    
    // Verificar votos
    function checkVotes() {
        fetch('/api/quiz/votes')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Quiz não está em execução');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    updateVotes(data.votes);
                }
            })
            .catch(error => {
                console.error('Erro ao verificar votos:', error);
            });
    }
    
    // Verificar chat
    function checkChat() {
        fetch('/api/quiz/chat')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateChat(data.messages);
                }
            })
            .catch(error => {
                console.error('Erro ao verificar chat:', error);
            });
    }
    
    // Carregar ranking
    function loadRanking() {
        fetch('/api/ranking')
            .then(response => response.json())
            .then(data => {
                updateRanking(data);
            })
            .catch(error => {
                console.error('Erro ao carregar ranking:', error);
            });
    }
    
    // Iniciar o quiz
    function startQuiz() {
        fetch('/api/quiz/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                quizRunning = true;
                updateUI();
                console.log('Quiz iniciado');
            } else {
                alert('Erro ao iniciar quiz: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Erro ao iniciar quiz:', error);
            alert('Erro ao iniciar quiz. Verifique o console para mais detalhes.');
        });
    }
    
    // Parar o quiz
    function stopQuiz() {
        fetch('/api/quiz/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                quizRunning = false;
                updateUI();
                console.log('Quiz parado');
            } else {
                alert('Erro ao parar quiz: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Erro ao parar quiz:', error);
            alert('Erro ao parar quiz. Verifique o console para mais detalhes.');
        });
    }
    
    // Atualizar UI com base no estado do quiz
    function updateUI() {
        if (!quizStatus) return;
        
        if (quizRunning) {
            quizStatus.innerHTML = '<div class="running">Quiz em andamento</div>';
        } else {
            quizStatus.innerHTML = '<div class="waiting">Aguardando início do quiz...</div>';
            
            // Esconder containers de pergunta e resultado
            if (questionContainer) questionContainer.classList.add('hidden');
            if (resultContainer) resultContainer.classList.add('hidden');
        }
    }
    
    // Mostrar pergunta
    function showQuestion(questionData) {
        if (!questionContainer || !questionText || !timer) return;
        
        // Mostrar container de pergunta
        questionContainer.classList.remove('hidden');
        
        // Esconder container de resultado
        if (resultContainer) resultContainer.classList.add('hidden');
        
        // Atualizar número da pergunta
        if (questionNumber) {
            questionNumber.textContent = questionData.question_num;
        }
        
        // Atualizar texto da pergunta
        questionText.textContent = questionData.question;
        
        // Atualizar opções
        updateOption(optionA, 'A', questionData.options.A);
        updateOption(optionB, 'B', questionData.options.B);
        updateOption(optionC, 'C', questionData.options.C);
        updateOption(optionD, 'D', questionData.options.D);
        
        // Iniciar timer
        startTimer(questionData.answer_time);
    }
    
    // Atualizar opção
    function updateOption(optionElement, letter, text) {
        if (!optionElement) return;
        
        const optionText = optionElement.querySelector('.option-text');
        if (optionText) {
            optionText.textContent = text;
        }
    }
    
    // Iniciar timer
    function startTimer(time) {
        // Limpar intervalo anterior
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        
        // Definir tempo inicial
        currentTime = time;
        updateTimer(currentTime);
        
        // Iniciar contagem regressiva
        countdownInterval = setInterval(function() {
            currentTime--;
            updateTimer(currentTime);
            
            if (currentTime <= 0) {
                clearInterval(countdownInterval);
            }
        }, 1000);
    }
    
    // Atualizar timer
    function updateTimer(time) {
        if (!timer) return;
        
        timer.textContent = time;
    }
    
    // Atualizar votos
    function updateVotes(votes) {
        updateOptionVotes(optionA, votes.A);
        updateOptionVotes(optionB, votes.B);
        updateOptionVotes(optionC, votes.C);
        updateOptionVotes(optionD, votes.D);
    }
    
    // Atualizar votos de uma opção
    function updateOptionVotes(optionElement, votes) {
        if (!optionElement) return;
        
        const optionVotes = optionElement.querySelector('.option-votes');
        if (optionVotes) {
            optionVotes.textContent = votes + ' votos';
        }
    }
    
    // Atualizar ranking
    function updateRanking(ranking) {
        if (!rankingList) return;
        
        let html = '';
        
        if (Object.keys(ranking).length === 0) {
            html = '<div class="empty-ranking">Nenhum participante ainda</div>';
        } else {
            html = '<ol>';
            
            // Converter para array e ordenar
            const sortedRanking = Object.entries(ranking)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            sortedRanking.forEach(([user, points]) => {
                html += `<li><span class="user">${user}</span><span class="points">${points}</span></li>`;
            });
            
            html += '</ol>';
        }
        
        rankingList.innerHTML = html;
    }
    
    // Atualizar chat
    function updateChat(messages) {
        if (!chatMessages) return;
        
        let html = '';
        
        if (messages.length === 0) {
            html = '<div class="empty-chat">Nenhuma mensagem ainda</div>';
        } else {
            messages.forEach(message => {
                html += `<div class="chat-message">
                    <span class="author">${message.author}:</span>
                    <span class="message">${message.message}</span>
                </div>`;
            });
        }
        
        chatMessages.innerHTML = html;
        
        // Auto-scroll para a última mensagem
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});
