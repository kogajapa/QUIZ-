// Arquivo dedicado para gerenciar as configurações do quiz

// Namespace para funções de configuração do quiz
const QuizConfig = {
    // Inicializar configurações
    init: function() {
        const btnTestConnection = document.getElementById('btnTestConnection');
        if (btnTestConnection) {
            btnTestConnection.addEventListener('click', this.handleTestConnection.bind(this));
            this.loadConfig();
        }
    },

    // Função para lidar com o clique no botão de teste de conexão
    handleTestConnection: function() {
        const youtubeUrl = document.getElementById('youtubeUrl');
        const btnTestConnection = document.getElementById('btnTestConnection');
        const connectionStatus = document.getElementById('connectionStatus');
        
        if (!youtubeUrl || !connectionStatus) return;
        
        const url = youtubeUrl.value.trim();
        
        this.testConnection(url, connectionStatus, youtubeUrl, btnTestConnection);
    },
    
    // Função que realmente testa a conexão com o servidor
    testConnection: function(url, connectionStatus, youtubeUrl, btnTestConnection) {
        // Garantir que url seja uma string
        const urlStr = String(url || '');
        
        if (!urlStr || urlStr.trim() === '') {
            this.showConnectionStatus(connectionStatus, 'error', 'Por favor, insira uma URL do YouTube válida');
            return;
        }
        
        // Validar URL antes de enviar
        if (!urlStr.includes('youtube.com') && !urlStr.includes('youtu.be')) {
            this.showConnectionStatus(connectionStatus, 'error', 'URL inválida. Insira uma URL do YouTube válida');
            return;
        }
        
        // Mostrar status de carregamento
        this.showConnectionStatus(connectionStatus, 'loading', 'Testando conexão com o chat do YouTube...');
        
        // Desativar botão durante o teste
        if (btnTestConnection) {
            btnTestConnection.disabled = true;
            btnTestConnection.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...';
        }
        
        // Enviar requisição para testar a conexão
        fetch('/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: urlStr })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                this.showConnectionStatus(connectionStatus, 'success', data.message);
            } else {
                this.showConnectionStatus(connectionStatus, 'error', data.message || 'Erro desconhecido ao testar conexão');
            }
        })
        .catch((error) => {
            console.error('Erro ao testar conexão:', error);
            this.showConnectionStatus(connectionStatus, 'error', 'Erro ao testar conexão. Verifique a URL e tente novamente.');
        })
        .finally(() => {
            // Reativar botão após o teste
            if (btnTestConnection) {
                btnTestConnection.disabled = false;
                btnTestConnection.innerHTML = 'Testar Conexão';
            }
        });
    },
    
    // Função para exibir o status da conexão
    showConnectionStatus: function(element, status, message) {
        if (!element) return;
        
        // Limpar classes anteriores
        element.className = 'connection-status';
        
        // Adicionar classe de acordo com o status
        element.classList.add(status);
        
        // Definir mensagem
        element.innerHTML = message;
        
        // Tornar visível
        element.style.display = 'block';
    },
    
    // Carregar configurações do servidor
    loadConfig: function() {
        // Obter referências aos elementos
        const youtubeUrl = document.getElementById('youtubeUrl');
        const answerTime = document.getElementById('answerTime');
        const voteCountingTime = document.getElementById('voteCountingTime');
        const resultDisplayTime = document.getElementById('resultDisplayTime');
        const primaryColor = document.getElementById('primaryColor');
        const secondaryColor = document.getElementById('secondaryColor');
        const enableChatSimulator = document.getElementById('enableChatSimulator');
        const simulatorStatus = document.getElementById('simulatorStatus');
        
        // Verificar se os elementos existem
        if (!youtubeUrl || !answerTime || !voteCountingTime || 
            !resultDisplayTime || !primaryColor || !secondaryColor) {
            return;
        }
        
        // Definir valores padrão
        youtubeUrl.value = '';
        answerTime.value = 20;
        voteCountingTime.value = 8;
        resultDisplayTime.value = 5;
        primaryColor.value = '#f39c12';
        secondaryColor.value = '#8e44ad';
        
        if (enableChatSimulator) {
            enableChatSimulator.checked = true;
            if (simulatorStatus) simulatorStatus.textContent = 'Ativado';
            
            // Adicionar evento para atualizar o texto do status
            enableChatSimulator.addEventListener('change', function() {
                if (simulatorStatus) {
                    simulatorStatus.textContent = this.checked ? 'Ativado' : 'Desativado';
                }
            });
        }
        
        // Tentar carregar configurações do servidor
        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                if (data) {
                    // Atualizar valores com dados do servidor
                    if (data.youtube_url) youtubeUrl.value = data.youtube_url;
                    if (data.answer_time) answerTime.value = data.answer_time;
                    if (data.vote_count_time) voteCountingTime.value = data.vote_count_time;
                    if (data.result_display_time) resultDisplayTime.value = data.result_display_time;
                    if (data.primary_color) primaryColor.value = data.primary_color;
                    if (data.secondary_color) secondaryColor.value = data.secondary_color;
                    
                    // Atualizar estado do simulador de chat
                    if (enableChatSimulator && data.enable_chat_simulator !== undefined) {
                        enableChatSimulator.checked = data.enable_chat_simulator;
                        if (simulatorStatus) {
                            simulatorStatus.textContent = data.enable_chat_simulator ? 'Ativado' : 'Desativado';
                        }
                    }
                }
            })
            .catch(() => {
                // Silenciosamente ignorar erros - já temos valores padrão
            });
    },
    
    // Salvar configurações no servidor
    saveConfig: function() {
        // Obter referências aos elementos
        const youtubeUrl = document.getElementById('youtubeUrl');
        const answerTime = document.getElementById('answerTime');
        const voteCountingTime = document.getElementById('voteCountingTime');
        const resultDisplayTime = document.getElementById('resultDisplayTime');
        const primaryColor = document.getElementById('primaryColor');
        const secondaryColor = document.getElementById('secondaryColor');
        const enableChatSimulator = document.getElementById('enableChatSimulator');
        
        // Verificar se os elementos existem
        if (!youtubeUrl || !answerTime || !voteCountingTime || 
            !resultDisplayTime || !primaryColor || !secondaryColor) {
            console.error('Elementos de configuração não encontrados');
            return;
        }
        
        // Criar objeto de configuração
        const config = {
            youtube_url: youtubeUrl.value,
            answer_time: parseInt(answerTime.value),
            vote_count_time: parseInt(voteCountingTime.value),
            result_display_time: parseInt(resultDisplayTime.value),
            primary_color: primaryColor.value,
            secondary_color: secondaryColor.value,
            enable_chat_simulator: enableChatSimulator ? enableChatSimulator.checked : true
        };
        
        // Enviar configuração para o servidor
        fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showNotification('Configurações salvas com sucesso!', 'success');
            } else {
                this.showNotification('Erro ao salvar configurações: ' + data.message, 'error');
            }
        })
        .catch(error => {
            this.showNotification('Erro ao salvar configurações: ' + error, 'error');
        });
    },
    
    // Função para exibir notificação
    showNotification: function(message, type) {
        // Implementar lógica para exibir notificação
        console.log(`Notificação ${type}: ${message}`);
    }
};

// Inicializar quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    QuizConfig.init();
});
