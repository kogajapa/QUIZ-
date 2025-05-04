/**
 * Quiz.js - Versão híbrida com Socket.IO e fallback HTTP
 * Script para gerenciar o quiz usando Socket.IO com fallback para requisições HTTP
 */

document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const questionContainer = document.getElementById('questionContainer');
    const resultContainer = document.getElementById('resultContainer');
    const currentQuestionNum = document.getElementById('currentQuestionNum');
    const totalQuestions = document.getElementById('totalQuestions');
    const timer = document.getElementById('timer');
    const questionText = document.getElementById('questionText');
    const optionA = document.getElementById('optionA');
    const optionB = document.getElementById('optionB');
    const optionC = document.getElementById('optionC');
    const optionD = document.getElementById('optionD');
    const correctAnswerText = document.getElementById('correctAnswerText');
    const explanationText = document.getElementById('explanationText');
    const rankList = document.getElementById('rankList');
    const chatContainer = document.getElementById('chatContainer');
    const countingVotesElement = document.getElementById('countingVotes');
    const quizOverlay = document.getElementById('quizOverlay');
    const totalVotesElement = document.getElementById('totalVotes');
    const correctVotesElement = document.getElementById('correctVotes');
    const correctPercentageElement = document.getElementById('correctPercentage');
    const quizStatusElement = document.getElementById('quizStatus');

    // Variáveis globais
    let socket;
    let quizRunning = false;
    let countdownInterval = null;
    let currentTime = 0;
    let socketConnected = false;
    let usingFallback = false;
    let lastChatTimestamp = 0;
    let fallbackPollingInterval = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 15;  // Aumentado para dar mais chances à conexão WebSocket

    // Inicializar
    init();
    
    function init() {
        console.log('Inicializando quiz...');
        
        // Tentar conectar via Socket.IO
        connectSocket();
        
        // Adicionar botões de controle
        addControlButtons();
        
        // Carregar ranking inicial
        loadRanking();
    }
    
    // Conectar ao Socket.IO com fallback para HTTP
    function connectSocket() {
        try {
            // Tentar conectar via Socket.IO
            socket = io({
                transports: ['websocket', 'polling'],  // Tentar WebSocket primeiro, fallback para polling
                upgrade: true,                        // Permitir upgrade de polling para websocket
                reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
                reconnectionDelay: 1000,
                timeout: 60000,
                forceNew: true,
                path: '/socket.io/',
                query: {
                    t: new Date().getTime(),
                    EIO: '4'  // Forçar Engine.IO v4
                },
                extraHeaders: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            // Configurar socket listeners
            setupSocketListeners();
            
            // Adicionar log para monitorar o tipo de transporte
            socket.on('connect', function() {
                console.log('Conectado usando transporte:', socket.io.engine.transport.name);
                
                if (socket.io.engine.transport.name === 'websocket') {
                    console.log('Conexão WebSocket estabelecida com sucesso!');
                    addSystemMessage('Conexão WebSocket estabelecida com sucesso!');
                } else {
                    console.warn('Não está usando WebSocket! Usando:', socket.io.engine.transport.name);
                    addSystemMessage('Aviso: Não está usando WebSocket!');
                }
            });
            
            // Verificar se a conexão foi estabelecida após um tempo
            setTimeout(function() {
                if (!socketConnected && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    console.log('WebSocket não conectou. Tentando novamente... Tentativa ' + (reconnectAttempts + 1) + ' de ' + MAX_RECONNECT_ATTEMPTS);
                    addSystemMessage('Tentando estabelecer conexão WebSocket... Tentativa ' + (reconnectAttempts + 1) + ' de ' + MAX_RECONNECT_ATTEMPTS);
                    reconnectAttempts++;
                    
                    if (socket) {
                        socket.disconnect();
                    }
                    
                    connectSocket();
                } else if (!socketConnected) {
                    console.log('WebSocket falhou após várias tentativas. Usando fallback HTTP.');
                    addSystemMessage('WebSocket falhou após várias tentativas. Usando modo de contingência HTTP.');
                    activateFallbackMode();
                }
            }, 5000);
        } catch (error) {
            console.error('Erro ao conectar Socket.IO:', error);
            activateFallbackMode();
        }
    }
    
    // Ativar modo de fallback com requisições HTTP
    function activateFallbackMode() {
        usingFallback = true;
        
        // Adicionar notificação de fallback
        addFallbackNotice();
        
        // Iniciar polling para atualizações
        startFallbackPolling();
        
        console.log('Modo fallback ativado. Usando requisições HTTP.');
    }
    
    // Adicionar notificação de fallback
    function addFallbackNotice() {
        // Verificar se a notificação já existe
        if (document.getElementById('fallbackNotice')) {
            return;
        }
        
        const fallbackNotice = document.createElement('div');
        fallbackNotice.id = 'fallbackNotice';
        fallbackNotice.className = 'fallback-notice';
        fallbackNotice.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Modo de compatibilidade ativado';
        
        // Adicionar ao DOM - verificar se o elemento existe
        if (quizStatusElement && quizStatusElement.parentNode) {
            quizStatusElement.parentNode.insertBefore(fallbackNotice, quizStatusElement);
        } else if (questionContainer && questionContainer.parentNode) {
            questionContainer.parentNode.insertBefore(fallbackNotice, questionContainer);
        }
    }
    
    // Iniciar polling para atualizações no modo fallback
    function startFallbackPolling() {
        // Parar polling anterior se existir
        if (fallbackPollingInterval) {
            clearInterval(fallbackPollingInterval);
        }
        
        // Verificar status inicial
        checkQuizStatus();
        
        // Configurar polling a cada 2 segundos
        fallbackPollingInterval = setInterval(function() {
            checkQuizStatus();
            
            if (quizRunning) {
                getCurrentQuestion();
                getVotes();
                getChatMessages();
            }
        }, 2000);
        
        // Carregar ranking a cada 5 segundos
        setInterval(function() {
            getRanking();
        }, 5000);
    }
    
    // Verificar status do quiz via HTTP
    function checkQuizStatus() {
        fetch('/api/quiz/status-http')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    quizRunning = data.quiz_running;
                    updateUI();
                }
            })
            .catch(error => console.error('Erro ao verificar status:', error));
    }
    
    // Obter pergunta atual via HTTP
    function getCurrentQuestion() {
        fetch('/api/quiz/current-question-http')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Quiz não está em execução ou não há pergunta atual');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    const question = data.question;
                    showQuestion(question, data.question_num, data.total_questions);
                    
                    // Atualizar timer apenas se for diferente do atual
                    if (currentTime !== data.remaining_time) {
                        updateTimer(data.remaining_time);
                        currentTime = data.remaining_time;
                    }
                }
            })
            .catch(error => console.error('Erro ao obter pergunta atual:', error));
    }
    
    // Obter votos via HTTP
    function getVotes() {
        fetch('/api/quiz/votes-http')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Quiz não está em execução');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    updateAllVotes(data.votes);
                }
            })
            .catch(error => console.error('Erro ao obter votos:', error));
    }
    
    // Obter mensagens do chat via HTTP
    function getChatMessages() {
        fetch(`/api/quiz/chat-http?since=${lastChatTimestamp}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        addChatMessage(msg.author, msg.message);
                        
                        // Atualizar o timestamp da última mensagem
                        if (msg.timestamp > lastChatTimestamp) {
                            lastChatTimestamp = msg.timestamp;
                        }
                    });
                }
            })
            .catch(error => console.error('Erro ao obter mensagens do chat:', error));
    }
    
    // Obter ranking via HTTP
    function getRanking() {
        fetch('/api/ranking-http')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateRanking(data.ranking);
                }
            })
            .catch(error => console.error('Erro ao obter ranking:', error));
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
        if (quizStatusElement) {
            quizStatusElement.parentNode.insertBefore(controlsDiv, quizStatusElement);
        }
    }
    
    // Configurar socket listeners
    function setupSocketListeners() {
        console.log('Configurando socket listeners...');
        
        // Status do quiz
        socket.on('status', function(data) {
            console.log('Status recebido:', data);
            quizRunning = data.quiz_running;
            updateUI();
        });
        
        // Atualizar timer
        socket.on('update_timer', function(data) {
            console.log('Timer atualizado:', data);
            updateTimer(data.time);
        });
        
        // Atualizar ranking
        socket.on('update_ranking', function(data) {
            console.log('Ranking atualizado:', data);
            updateRanking(data.ranking);
        });
        
        // Adicionar listener para o evento ranking_update
        socket.on('ranking_update', function(data) {
            console.log('Ranking recebido via ranking_update:', data);
            if (data && data.success && data.ranking) {
                updateRanking(data.ranking);
            }
        });
        
        // Receber mensagem de chat
        socket.on('chat_message', function(data) {
            console.log('Mensagem de chat recebida:', data);
            addChatMessage(data.author, data.message);
            
            // Atualizar o timestamp da última mensagem para o modo fallback
            if (data.timestamp) {
                lastChatTimestamp = data.timestamp;
            }
        });
        
        // Atualizar votos
        socket.on('update_votes', function(data) {
            console.log('Votos atualizados:', data);
            updateAllVotes(data.votes);
        });

        // Exibir contabilização de votos
        socket.on('show_counting_votes', function(data) {
            console.log('Contabilizando votos:', data);
            showCountingVotes();
        });

        // Exibir resultados
        socket.on('show_results', function(data) {
            console.log('Exibindo resultados:', data);
            
            // Aguardar um pouco antes de mostrar os resultados (para efeito visual)
            setTimeout(() => {
                hideCountingVotes();
                showResults(data.correct_answer, data.explanation, data.votes);
            }, 1000);
        });

        // Próxima pergunta
        socket.on('next_question', function(data) {
            console.log('Próxima pergunta:', data);
            hideResults();
            showQuestion(data.question, data.question_num, data.total_questions);
            startTimer(data.answer_time);
        });
        
        // Evento de erro
        socket.on('error', function(data) {
            console.error('Erro recebido:', data);
            alert('Erro: ' + (data.message || 'Erro desconhecido'));
        });
        
        // Evento de conexão
        socket.on('connect', function() {
            console.log('Conectado ao servidor');
            socketConnected = true;
        });
        
        // Evento de desconexão
        socket.on('disconnect', function() {
            console.log('Desconectado do servidor');
            socketConnected = false;
            
            // Se desconectar após ter conectado, tentar reconectar algumas vezes
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Tentativa de reconexão ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
            } else {
                console.log('Máximo de tentativas de reconexão atingido. Usando fallback HTTP.');
                activateFallbackMode();
            }
        });
        
        // Evento de erro de conexão
        socket.on('connect_error', function(error) {
            console.error('Erro de conexão Socket.IO:', error);
            
            // Se houver erro de conexão, incrementar tentativas
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Erro de conexão. Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
            } else {
                console.log('Máximo de tentativas de conexão atingido. Usando fallback HTTP.');
                activateFallbackMode();
            }
        });
    }

    // Carregar ranking
    function loadRanking() {
        console.log('Carregando ranking...');
        
        if (socketConnected) {
            socket.emit('get_ranking', {});
        } else {
            getRanking();
        }
    }

    // Iniciar o quiz
    function startQuiz() {
        if (!quizRunning) {
            if (socketConnected) {
                socket.emit('start_quiz', {});
                console.log('Solicitação para iniciar quiz enviada via Socket.IO');
            } else {
                fetch('/api/quiz/start-http', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    console.log('Resposta ao iniciar quiz via HTTP:', data);
                    if (data.success) {
                        quizRunning = true;
                        updateUI();
                    } else {
                        alert('Erro ao iniciar quiz: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Erro ao iniciar quiz via HTTP:', error);
                    alert('Erro ao iniciar quiz: ' + error.message);
                });
            }
        }
    }

    // Parar o quiz
    function stopQuiz() {
        if (quizRunning) {
            if (socketConnected) {
                socket.emit('stop_quiz', {});
                console.log('Solicitação para parar quiz enviada via Socket.IO');
            } else {
                fetch('/api/quiz/stop-http', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    console.log('Resposta ao parar quiz via HTTP:', data);
                    if (data.success) {
                        quizRunning = false;
                        updateUI();
                    } else {
                        alert('Erro ao parar quiz: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Erro ao parar quiz via HTTP:', error);
                    alert('Erro ao parar quiz: ' + error.message);
                });
            }
        }
    }

    // Atualizar interface com base no estado do quiz
    function updateUI() {
        if (questionContainer) {
            questionContainer.style.display = 'block';
        }
        
        if (quizRunning) {
            if (resultContainer) {
                resultContainer.style.display = 'none';
            }
        } else {
            // Parar o timer
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }
    }

    // Iniciar o timer
    function startTimer(seconds) {
        // Parar timer anterior se existir
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        
        // Definir tempo inicial
        currentTime = seconds;
        updateTimer(currentTime);
        
        // Iniciar contagem regressiva
        countdownInterval = setInterval(function() {
            currentTime--;
            updateTimer(currentTime);
            
            if (currentTime <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }, 1000);
    }

    // Atualizar o timer na interface
    function updateTimer(seconds) {
        if (timer) {
            timer.textContent = seconds;
            
            // Adicionar classe de alerta quando o tempo estiver acabando
            if (seconds <= 5) {
                timer.classList.add('timer-alert');
            } else {
                timer.classList.remove('timer-alert');
            }
        }
    }

    // Adicionar mensagem ao chat
    function addChatMessage(author, message) {
        if (!chatContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        const authorElement = document.createElement('span');
        authorElement.className = 'chat-author';
        authorElement.textContent = author + ': ';
        
        const contentElement = document.createElement('span');
        contentElement.className = 'chat-content';
        contentElement.textContent = message;
        
        messageElement.appendChild(authorElement);
        messageElement.appendChild(contentElement);
        
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Adicionar mensagem de sistema ao chat
    function addSystemMessage(message) {
        if (!chatContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message system-message';
        messageElement.textContent = message;
        
        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Atualizar votos para uma opção
    function updateVotes(option, votes, totalVotes) {
        const optionElements = {
            'A': optionA,
            'B': optionB,
            'C': optionC,
            'D': optionD
        };
        
        const optionElement = optionElements[option];
        if (!optionElement) return;
        
        const votesElement = optionElement.querySelector('.option-votes');
        const progressElement = optionElement.querySelector('.option-progress');
        
        if (!votesElement || !progressElement) return;
        
        // Calcular a porcentagem
        const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        
        // Atualizar o texto dos votos com a porcentagem
        votesElement.innerHTML = `${votes} <span class="option-votes-percentage">(${percentage}%)</span>`;
        
        // Atualizar a barra de progresso
        progressElement.style.width = `${percentage}%`;
    }

    // Atualizar todos os votos
    function updateAllVotes(votesData) {
        if (!votesData) return;
        
        const totalVotes = (votesData.a || 0) + (votesData.b || 0) + (votesData.c || 0) + (votesData.d || 0);
        
        // Atualizar cada opção
        updateVotes('A', votesData.a || 0, totalVotes);
        updateVotes('B', votesData.b || 0, totalVotes);
        updateVotes('C', votesData.c || 0, totalVotes);
        updateVotes('D', votesData.d || 0, totalVotes);
    }

    // Mostrar a mensagem "Contabilizando votos..."
    function showCountingVotes() {
        console.log('Mostrando mensagem de contabilização de votos');
        if (countingVotesElement) {
            countingVotesElement.classList.add('active');
        }
    }

    // Esconder a mensagem "Contabilizando votos..."
    function hideCountingVotes() {
        console.log('Escondendo mensagem de contabilização de votos');
        if (countingVotesElement) {
            countingVotesElement.classList.remove('active');
        }
    }

    // Mostrar o popup de resultados
    function showResults(correctAnswer, explanation, votesData) {
        console.log('Mostrando resultados:', correctAnswer, explanation, votesData);
        
        if (!correctAnswerText || !explanationText || !quizOverlay || !resultContainer || 
            !totalVotesElement || !correctVotesElement || !correctPercentageElement) {
            console.error('Elementos necessários para mostrar resultados não encontrados');
            return;
        }
        
        // Marcar a opção correta
        const options = {
            'A': optionA,
            'B': optionB,
            'C': optionC,
            'D': optionD
        };
        
        // Remover classe 'correct' de todas as opções
        Object.values(options).forEach(option => {
            if (option) option.classList.remove('correct');
        });
        
        // Adicionar classe à opção correta
        if (options[correctAnswer]) {
            options[correctAnswer].classList.add('correct');
        }
        
        // Calcular estatísticas
        const totalVotes = (votesData.a || 0) + (votesData.b || 0) + (votesData.c || 0) + (votesData.d || 0);
        let correctVotes = 0;
        
        // Determinar quantos votos foram para a resposta correta
        if (correctAnswer && votesData[correctAnswer.toLowerCase()]) {
            correctVotes = votesData[correctAnswer.toLowerCase()];
        }
        
        const correctPercentage = totalVotes > 0 ? Math.round((correctVotes / totalVotes) * 100) : 0;
        
        // Atualizar o conteúdo do popup
        correctAnswerText.innerHTML = `<i class="fas fa-check-circle"></i> Resposta Correta: ${correctAnswer}`;
        explanationText.innerHTML = explanation || "Sem explicação disponível.";
        totalVotesElement.textContent = totalVotes;
        correctVotesElement.textContent = correctVotes;
        correctPercentageElement.textContent = `${correctPercentage}%`;
        
        // Mostrar o overlay e o popup
        quizOverlay.classList.add('active');
        resultContainer.classList.add('active');
        
        console.log('Popup de resultados exibido');
    }

    // Esconder o popup de resultados
    function hideResults() {
        if (quizOverlay) quizOverlay.classList.remove('active');
        if (resultContainer) resultContainer.classList.remove('active');
    }

    // Atualizar ranking
    function updateRanking(ranking) {
        if (!rankList) return;
        
        if (!ranking || ranking.length === 0) {
            rankList.innerHTML = '<div class="no-ranking">Nenhum participante ainda.</div>';
            return;
        }
        
        // Limpar ranking atual
        rankList.innerHTML = '';
        
        // Adicionar cada item ao ranking
        ranking.forEach((item, index) => {
            const rankItem = document.createElement('div');
            rankItem.className = 'rank-item';
            
            const position = document.createElement('div');
            position.className = 'rank-position';
            position.textContent = `#${index + 1}`;
            
            const name = document.createElement('div');
            name.className = 'rank-name';
            name.textContent = item.name;
            
            const score = document.createElement('div');
            score.className = 'rank-score';
            score.textContent = item.score;
            
            rankItem.appendChild(position);
            rankItem.appendChild(name);
            rankItem.appendChild(score);
            
            rankList.appendChild(rankItem);
        });
    }

    // Mostrar uma pergunta
    function showQuestion(question, questionNum, totalQuestionsCount) {
        console.log('Mostrando pergunta:', question);
        
        if (!questionText || !currentQuestionNum || !totalQuestions || 
            !optionA || !optionB || !optionC || !optionD) {
            console.error('Elementos necessários para mostrar pergunta não encontrados');
            return;
        }
        
        // Remover classe 'correct' de todas as opções
        optionA.classList.remove('correct');
        optionB.classList.remove('correct');
        optionC.classList.remove('correct');
        optionD.classList.remove('correct');
        
        currentQuestionNum.textContent = questionNum;
        totalQuestions.textContent = totalQuestionsCount;
        questionText.textContent = question.text || question.question;
        
        // Atualizar as opções - verificando diferentes formatos possíveis
        if (question.options) {
            // Formato 1: {A: "texto", B: "texto", ...}
            if (question.options.A !== undefined) {
                optionA.querySelector('.option-text').textContent = question.options.A;
                optionB.querySelector('.option-text').textContent = question.options.B;
                optionC.querySelector('.option-text').textContent = question.options.C;
                optionD.querySelector('.option-text').textContent = question.options.D;
            } 
            // Formato 2: ["texto", "texto", ...]
            else if (Array.isArray(question.options)) {
                optionA.querySelector('.option-text').textContent = question.options[0] || '';
                optionB.querySelector('.option-text').textContent = question.options[1] || '';
                optionC.querySelector('.option-text').textContent = question.options[2] || '';
                optionD.querySelector('.option-text').textContent = question.options[3] || '';
            }
        }
        
        // Resetar os votos
        const resetVotes = { a: 0, b: 0, c: 0, d: 0 };
        updateAllVotes(resetVotes);
        
        // Resetar as barras de progresso
        document.querySelectorAll('.option-progress').forEach(el => {
            if (el) el.style.width = '0%';
        });
        
        // Mostrar o container de perguntas e esconder o de resultados
        if (questionContainer) questionContainer.style.display = 'block';
        hideResults();
        
        console.log('Pergunta exibida com opções:', {
            A: optionA.querySelector('.option-text')?.textContent,
            B: optionB.querySelector('.option-text')?.textContent,
            C: optionC.querySelector('.option-text')?.textContent,
            D: optionD.querySelector('.option-text')?.textContent
        });
    }

    // Adicionar evento para voltar ao menu quando ESC for pressionado
    document.addEventListener('keydown', function(event) {
        // Verificar se a tecla pressionada é ESC (código 27)
        if (event.keyCode === 27) {
            console.log('Tecla ESC pressionada - voltando ao menu inicial');
            // Redirecionar para a página inicial
            window.location.href = '/';
        }
    });

    // Adicionar evento de clique para o botão de voltar
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', function() {
            console.log('Botão voltar clicado - redirecionando para o menu inicial');
            window.location.href = '/';
        });
    }

    // Função para conectar ao chat do YouTube diretamente da página do quiz
    function setupYouTubeConnect() {
        console.log("Inicializando controles de conexão do YouTube");
        
        const connectButton = document.getElementById('connectYoutubeChat');
        const urlInput = document.getElementById('youtubeUrlDirect');
        
        if (!connectButton || !urlInput) {
            console.error("Elementos de conexão do YouTube não encontrados");
            return;
        }
        
        console.log("Elementos de conexão do YouTube encontrados");
        
        // Carregar URL atual
        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                if (data && data.youtube_url) {
                    urlInput.value = data.youtube_url;
                    console.log("URL carregada:", data.youtube_url);
                }
            })
            .catch(error => console.error('Erro ao carregar URL:', error));
        
        // Adicionar evento de clique ao botão
        connectButton.addEventListener('click', function() {
            console.log("Botão de conexão clicado");
            
            const url = urlInput.value.trim();
            if (!url) {
                alert('Por favor, insira uma URL do YouTube válida');
                return;
            }
            
            console.log("Tentando conectar à URL:", url);
            
            // Mostrar mensagem de carregamento
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                chatContainer.innerHTML += `
                    <div class="chat-message system">
                        <div class="message-author system">Sistema</div>
                        <div class="message-text">Conectando ao chat do YouTube...</div>
                    </div>
                `;
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            
            // Enviar URL para o servidor
            fetch('/api/connect-youtube', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url })
            })
            .then(response => response.json())
            .then(data => {
                console.log("Resposta do servidor:", data);
                
                if (data.success) {
                    if (chatContainer) {
                        chatContainer.innerHTML += `
                            <div class="chat-message system">
                                <div class="message-author system">Sistema</div>
                                <div class="message-text">Conectado com sucesso ao chat do YouTube!</div>
                            </div>
                        `;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                } else {
                    if (chatContainer) {
                        chatContainer.innerHTML += `
                            <div class="chat-message system error">
                                <div class="message-author system">Sistema</div>
                                <div class="message-text">Erro ao conectar: ${data.message || 'Erro desconhecido'}</div>
                            </div>
                        `;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }
                }
            })
            .catch(error => {
                console.error("Erro na requisição:", error);
                
                if (chatContainer) {
                    chatContainer.innerHTML += `
                        <div class="chat-message system error">
                            <div class="message-author system">Sistema</div>
                            <div class="message-text">Erro ao conectar: ${error}</div>
                        </div>
                    `;
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            });
        });
    }

    // Inicializar quando o documento estiver pronto
    document.addEventListener('DOMContentLoaded', function() {
        console.log("DOM carregado, inicializando controles");
        setupYouTubeConnect();
    });
});
