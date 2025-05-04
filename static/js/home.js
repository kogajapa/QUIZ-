document.addEventListener('DOMContentLoaded', function() {
    // Elementos DOM
    const configForm = document.getElementById('configForm');
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const answerTimeInput = document.getElementById('answerTime');
    const voteCountingTimeInput = document.getElementById('voteCountingTime');
    const resultDisplayTimeInput = document.getElementById('resultDisplayTime');
    const primaryColorInput = document.getElementById('primaryColor');
    const secondaryColorInput = document.getElementById('secondaryColor');
    const colorPresets = document.querySelectorAll('.color-preset');
    const questionsList = document.getElementById('questionsList');
    const btnAddQuestion = document.getElementById('btnAddQuestion');
    const btnImportQuestions = document.getElementById('btnImportQuestions');
    const btnExportQuestions = document.getElementById('btnExportQuestions');
    const questionModal = document.getElementById('questionModal');
    const importModal = document.getElementById('importModal');
    const questionForm = document.getElementById('questionForm');
    const modalTitle = document.getElementById('modalTitle');
    const questionIndex = document.getElementById('questionIndex');
    const questionText = document.getElementById('questionText');
    const optionA = document.getElementById('optionA');
    const optionB = document.getElementById('optionB');
    const optionC = document.getElementById('optionC');
    const optionD = document.getElementById('optionD');
    const correctAnswer = document.getElementById('correctAnswer');
    const explanation = document.getElementById('explanation');
    const btnCancelQuestion = document.getElementById('btnCancelQuestion');
    const btnConfirmImport = document.getElementById('btnConfirmImport');
    const btnCancelImport = document.getElementById('btnCancelImport');
    const jsonImport = document.getElementById('jsonImport');
    const fileImport = document.getElementById('fileImport');
    const closeBtns = document.querySelectorAll('.close');

    // Variáveis globais
    let questions = [];

    // Carregar configurações
    function loadConfig() {
        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                youtubeUrlInput.value = data.youtube_url || '';
                answerTimeInput.value = data.answer_time || 20;
                voteCountingTimeInput.value = data.vote_counting_time || 8;
                resultDisplayTimeInput.value = data.result_display_time || 5;
                primaryColorInput.value = data.primary_color || '#f39c12';
                secondaryColorInput.value = data.secondary_color || '#8e44ad';
                
                // Atualizar o preset ativo, se houver correspondência
                updateActivePreset();
            })
            .catch(error => {
                console.error('Erro ao carregar configurações:', error);
                showNotification('Erro ao carregar configurações', 'error');
            });
    }
    
    // Atualizar o preset ativo com base nas cores selecionadas
    function updateActivePreset() {
        // Remover a classe 'active' de todos os presets
        colorPresets.forEach(preset => preset.classList.remove('active'));
        
        // Verificar se algum preset corresponde às cores atuais
        colorPresets.forEach(preset => {
            const presetPrimary = preset.getAttribute('data-primary');
            const presetSecondary = preset.getAttribute('data-secondary');
            
            if (presetPrimary === primaryColorInput.value && 
                presetSecondary === secondaryColorInput.value) {
                preset.classList.add('active');
            }
        });
    }

    // Carregar perguntas
    function loadQuestions() {
        // Verificar se o elemento questionsList existe
        if (questionsList) {
            questionsList.innerHTML = '<div class="loading">Carregando perguntas...</div>';
        }
        
        fetch('/api/questions')
            .then(response => response.json())
            .then(data => {
                questions = data;
                // Só renderizar as perguntas se o elemento questionsList existir
                if (questionsList) {
                    renderQuestions();
                }
            })
            .catch(error => {
                console.error('Erro ao carregar perguntas:', error);
                showNotification('Erro ao carregar perguntas', 'error');
                if (questionsList) {
                    questionsList.innerHTML = '<div class="error">Erro ao carregar perguntas. Tente novamente.</div>';
                }
            });
    }

    // Renderizar lista de perguntas
    function renderQuestions() {
        // Verificar se o elemento questionsList existe
        if (!questionsList) {
            console.log('Elemento questionsList não encontrado, pulando renderização');
            return;
        }
        
        if (questions.length === 0) {
            questionsList.innerHTML = '<div class="empty-list">Nenhuma pergunta cadastrada. Clique em "Adicionar Pergunta" para começar.</div>';
            return;
        }

        let html = '';
        questions.forEach((question, index) => {
            const options = question.options;
            const correctOptionIndex = question.correct_answer;
            const correctOptionLetter = ['A', 'B', 'C', 'D'][correctOptionIndex];
            
            html += `
                <div class="question-item" data-index="${index}">
                    <div class="question-actions">
                        <button class="edit" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="delete" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                    <h3>${index + 1}. ${question.question}</h3>
                    <div class="question-options">
                        <div class="question-option ${correctOptionIndex === 0 ? 'correct' : ''}">
                            <strong>A:</strong> ${options[0]}
                        </div>
                        <div class="question-option ${correctOptionIndex === 1 ? 'correct' : ''}">
                            <strong>B:</strong> ${options[1]}
                        </div>
                        <div class="question-option ${correctOptionIndex === 2 ? 'correct' : ''}">
                            <strong>C:</strong> ${options[2]}
                        </div>
                        <div class="question-option ${correctOptionIndex === 3 ? 'correct' : ''}">
                            <strong>D:</strong> ${options[3]}
                        </div>
                    </div>
                    <div class="question-explanation">
                        <strong>Resposta Correta:</strong> ${correctOptionLetter} - ${question.explanation}
                    </div>
                </div>
            `;
        });

        questionsList.innerHTML = html;

        // Adicionar event listeners para botões de editar e excluir
        questionsList.querySelectorAll('.edit').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.closest('.question-item').dataset.index);
                editQuestion(index);
            });
        });

        questionsList.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.closest('.question-item').dataset.index);
                if (confirm(`Tem certeza que deseja excluir a pergunta "${questions[index].question}"?`)) {
                    deleteQuestion(index);
                }
            });
        });
    }

    // Salvar configurações
    function saveConfig(event) {
        event.preventDefault();
        
        // Validar URL do YouTube
        const youtubeUrl = youtubeUrlInput.value.trim();
        if (youtubeUrl && !isValidYoutubeUrl(youtubeUrl)) {
            showNotification('URL do YouTube inválida. Por favor, insira uma URL válida.', 'error');
            return;
        }
        
        // Validar tempos
        const answerTime = parseInt(answerTimeInput.value);
        const voteCountingTime = parseInt(voteCountingTimeInput.value);
        const resultDisplayTime = parseInt(resultDisplayTimeInput.value);
        
        if (answerTime < 5 || answerTime > 60) {
            showNotification('O tempo para resposta deve estar entre 5 e 60 segundos.', 'error');
            return;
        }
        
        if (voteCountingTime < 3 || voteCountingTime > 30) {
            showNotification('O tempo para contabilizar votos deve estar entre 3 e 30 segundos.', 'error');
            return;
        }
        
        if (resultDisplayTime < 3 || resultDisplayTime > 30) {
            showNotification('O tempo de exibição dos resultados deve estar entre 3 e 30 segundos.', 'error');
            return;
        }
        
        // Preparar dados para envio
        const config = {
            youtube_url: youtubeUrlInput.value,
            answer_time: answerTime,
            vote_counting_time: voteCountingTime,
            result_display_time: resultDisplayTime,
            primary_color: primaryColorInput.value,
            secondary_color: secondaryColorInput.value
        };

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
                showNotification('Configurações salvas com sucesso!', 'success');
            } else {
                showNotification('Erro ao salvar configurações: ' + data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Erro ao salvar configurações:', error);
            showNotification('Erro ao salvar configurações', 'error');
        });
    }
    
    // Verificar se a URL do YouTube é válida
    function isValidYoutubeUrl(url) {
        // Padrão básico para URLs do YouTube
        const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i;
        return pattern.test(url);
    }

    // Abrir modal para adicionar nova pergunta
    function openAddQuestionModal() {
        modalTitle.textContent = 'Adicionar Pergunta';
        questionIndex.value = -1;
        questionForm.reset();
        questionModal.style.display = 'block';
    }

    // Abrir modal para editar pergunta existente
    function editQuestion(index) {
        const question = questions[index];
        
        modalTitle.textContent = 'Editar Pergunta';
        questionIndex.value = index;
        questionText.value = question.question;
        optionA.value = question.options[0];
        optionB.value = question.options[1];
        optionC.value = question.options[2];
        optionD.value = question.options[3];
        correctAnswer.value = question.correct_answer;
        explanation.value = question.explanation;
        
        questionModal.style.display = 'block';
    }

    // Excluir pergunta
    function deleteQuestion(index) {
        questions.splice(index, 1);
        saveQuestions();
    }

    // Salvar pergunta (nova ou editada)
    function saveQuestion(event) {
        event.preventDefault();
        
        const index = parseInt(questionIndex.value);
        const question = {
            question: questionText.value,
            options: [
                optionA.value,
                optionB.value,
                optionC.value,
                optionD.value
            ],
            correct_answer: parseInt(correctAnswer.value),
            explanation: explanation.value
        };

        if (index === -1) {
            // Nova pergunta
            questions.push(question);
        } else {
            // Editar pergunta existente
            questions[index] = question;
        }

        saveQuestions();
        questionModal.style.display = 'none';
    }

    // Salvar todas as perguntas no servidor
    function saveQuestions() {
        fetch('/api/questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ questions: questions })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Perguntas salvas com sucesso!', 'success');
                renderQuestions();
            } else {
                showNotification('Erro ao salvar perguntas', 'error');
            }
        })
        .catch(error => {
            console.error('Erro ao salvar perguntas:', error);
            showNotification('Erro ao salvar perguntas', 'error');
        });
    }

    // Exportar perguntas como JSON
    function exportQuestions() {
        const jsonData = JSON.stringify(questions, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quiz-perguntas.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Abrir modal de importação
    function openImportModal() {
        jsonImport.value = '';
        importModal.style.display = 'block';
    }

    // Importar perguntas do JSON
    function importQuestions() {
        try {
            const jsonData = jsonImport.value.trim();
            if (!jsonData) {
                showNotification('Por favor, insira um JSON válido', 'error');
                return;
            }
            
            const importedQuestions = JSON.parse(jsonData);
            
            // Validar formato das perguntas
            if (!Array.isArray(importedQuestions)) {
                throw new Error('O JSON deve ser um array de perguntas');
            }
            
            importedQuestions.forEach(q => {
                if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || 
                    typeof q.correct_answer !== 'number' || !q.explanation) {
                    throw new Error('Formato de pergunta inválido');
                }
            });
            
            // Confirmar substituição ou adição
            const action = confirm('Deseja substituir todas as perguntas existentes? Clique em OK para substituir ou Cancelar para adicionar às perguntas existentes.');
            
            if (action) {
                // Substituir
                questions = importedQuestions;
            } else {
                // Adicionar
                questions = questions.concat(importedQuestions);
            }
            
            saveQuestions();
            importModal.style.display = 'none';
            
        } catch (error) {
            console.error('Erro ao importar perguntas:', error);
            showNotification('Erro ao importar: ' + error.message, 'error');
        }
    }

    // Importar de arquivo
    function handleFileImport() {
        const file = fileImport.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            jsonImport.value = e.target.result;
        };
        reader.readAsText(file);
    }

    // Exibir notificação
    function showNotification(message, type = 'info') {
        // Implementação simples de notificação
        alert(message);
    }

    // Event Listeners - verificar se os elementos existem antes de adicionar event listeners
    if (configForm) configForm.addEventListener('submit', saveConfig);
    if (btnAddQuestion) btnAddQuestion.addEventListener('click', openAddQuestionModal);
    if (btnImportQuestions) btnImportQuestions.addEventListener('click', openImportModal);
    if (btnExportQuestions) btnExportQuestions.addEventListener('click', exportQuestions);
    if (questionForm) questionForm.addEventListener('submit', saveQuestion);
    if (btnCancelQuestion) btnCancelQuestion.addEventListener('click', () => questionModal.style.display = 'none');
    if (btnConfirmImport) btnConfirmImport.addEventListener('click', importQuestions);
    if (btnCancelImport) btnCancelImport.addEventListener('click', () => importModal.style.display = 'none');
    if (fileImport) fileImport.addEventListener('change', handleFileImport);
    
    // Event listeners para os presets de cores
    if (colorPresets && colorPresets.length > 0) {
        colorPresets.forEach(preset => {
            preset.addEventListener('click', function() {
                const primaryColor = this.getAttribute('data-primary');
                const secondaryColor = this.getAttribute('data-secondary');
                
                if (primaryColorInput) primaryColorInput.value = primaryColor;
                if (secondaryColorInput) secondaryColorInput.value = secondaryColor;
                
                // Atualizar o preset ativo
                if (colorPresets) {
                    colorPresets.forEach(p => p.classList.remove('active'));
                    this.classList.add('active');
                }
            });
        });
    }
    
    // Event listeners para atualização manual das cores
    if (primaryColorInput) primaryColorInput.addEventListener('change', updateActivePreset);
    if (secondaryColorInput) secondaryColorInput.addEventListener('change', updateActivePreset);
    
    // Fechar modais ao clicar no X
    if (closeBtns && closeBtns.length > 0) {
        closeBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.closest('.modal')) {
                    this.closest('.modal').style.display = 'none';
                }
            });
        });
    }

    // Fechar modais ao clicar fora deles
    window.addEventListener('click', function(event) {
        if (questionModal && event.target === questionModal) {
            questionModal.style.display = 'none';
        }
        if (importModal && event.target === importModal) {
            importModal.style.display = 'none';
        }
    });

    // Inicialização
    loadConfig();
    loadQuestions();
});
