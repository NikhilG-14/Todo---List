(() => {
  'use strict';

  // Data structures aligning with requirements
  let projects = [];
  let tasks = [];
  let timeEntries = [];
  let templates = [];
  let analytics = {
    tasksCompleted: 0,
    timeSpent: 0,
    productivity: 0,
    streaks: 0,
  };

  let currentUser = { id: 'u1', name: 'Me' };

  // State
  let currentProjectId = 'inbox';
  let selectedTaskId = null;
  let bulkSelectIds = new Set();
  let taskTimer = null;
  let timerStartTime = null;

  // DOM Elements
  const projectListEl = document.getElementById('projectList');
  const taskListEl = document.getElementById('taskList');
  const detailsPanel = document.getElementById('detailsPanel');
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskDescriptionInput = document.getElementById('taskDescriptionInput');
  const subtaskListEl = document.getElementById('subtaskList');
  const newSubtaskInput = document.getElementById('newSubtaskInput');
  const timeDisplayEl = document.getElementById('timeDisplay');
  const toggleTimerBtn = document.getElementById('toggleTimerBtn');
  const resetTimerBtn = document.getElementById('resetTimerBtn');
  const bulkActionsEl = document.getElementById('bulkActions');
  const bulkCountEl = document.getElementById('bulkCount');
  const bulkMarkCompleteBtn = document.getElementById('bulkMarkCompleteBtn');
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const floatingFab = document.getElementById('floatingFab');
  const searchInput = document.getElementById('searchInput');
  const closeDetailsBtn = document.getElementById('closeDetailsBtn');

  // Project Modal Elements
  const projectModal = document.getElementById('projectModal');
  const projectNameInput = document.getElementById('projectNameInput');
  const projectColorInput = document.getElementById('projectColorInput');
  const cancelProjectModalBtn = document.getElementById('cancelProjectModal');
  const saveProjectBtn = document.getElementById('saveProjectBtn');
  const openProjectModalBtn = document.getElementById('openProjectModalBtn');
  const sidebarAddProjectBtn = document.getElementById('sidebarAddProjectBtn');

  // HELPER FUNCTIONS
  const createUUID = () => crypto.randomUUID();

  // Format seconds to HH:MM:SS
  function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // Create new project
  function createProject(name, color) {
    const id = createUUID();
    const project = {
      id,
      name,
      description: '',
      color,
      progress: 0,
      deadline: null,
      members: [currentUser.id],
      settings: {},
    };
    projects.push(project);
    return id;
  }

  // Calculate project progress based on tasks completed ratio
  function updateProjectProgress(projectId) {
    const projTasks = tasks.filter(t => t.projectId === projectId);
    if (projTasks.length === 0) {
      updateProjectById(projectId, {progress: 0});
      return;
    }
    const completedCount = projTasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completedCount / projTasks.length) * 100);
    updateProjectById(projectId, {progress});
  }
  function updateProjectById(projectId, data) {
    const p = projects.find(p => p.id === projectId);
    if (p) Object.assign(p, data);
    renderProjects();
  }

  // Create new task
  function createTask(taskData) {
    const newTask = {
      id: createUUID(),
      title: taskData.title,
      description: taskData.description || '',
      projectId: taskData.projectId || 'inbox',
      priority: taskData.priority || 'medium',
      status: 'pending',
      dueDate: taskData.dueDate || null,
      tags: taskData.tags || [],
      subtasks: [],
      timeSpent: 0,
      createdBy: currentUser.id,
      assignedTo: currentUser.id,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    tasks.unshift(newTask);
    updateProjectProgress(newTask.projectId);
    renderTasks();
    return newTask.id;
  }

  // Update task by id
  function updateTaskById(taskId, updateData, silent = false) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    Object.assign(task, updateData);
    if ('subtasks' in updateData) {
      updateTaskStatusFromSubtasks(task);
    }
    if ('status' in updateData) {
      if(task.status === 'completed' && !task.completedAt){
        task.completedAt = new Date().toISOString();
      }
      if(task.status !== 'completed'){
        task.completedAt = null;
      }
    }
    updateProjectProgress(task.projectId);
    if(!silent) {
      renderTasks();
      if(selectedTaskId === taskId){
        renderTaskDetails(task);
      }
    }
  }

  // Delete task by id
  function deleteTaskById(taskId) {
    tasks = tasks.filter(t => t.id !== taskId);
    bulkSelectIds.delete(taskId);
    if(selectedTaskId === taskId) {
      selectedTaskId = null;
      closeDetailsPanel();
    }
    renderTasks();
    updateBulkActions();
  }
  // Delete multiple tasks
  function deleteTasksByIds(ids) {
    ids.forEach(id => deleteTaskById(id));
  }

  // Toggle task completion
  function toggleTaskCompletion(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.status !== 'completed') {
      updateTaskById(taskId, {status: 'completed', completedAt: new Date().toISOString()});
    } else {
      updateTaskById(taskId, {status: 'pending', completedAt: null});
    }
  }

  // Add subtask
  function addSubtask(task, title) {
    if (!title.trim()) return;
    const newSubtask = {
      id: createUUID(),
      title: title.trim(),
      status: 'pending',
    };
    task.subtasks.push(newSubtask);
    updateTaskStatusFromSubtasks(task);
    updateProjectProgress(task.projectId);
    renderTaskDetails(task);
    renderTasks();
  }
  
  // Update task status based on subtasks
  function updateTaskStatusFromSubtasks(task) {
    if (task.subtasks.length === 0) return;
    const allCompleted = task.subtasks.every(st => st.status === 'completed');
    if (allCompleted) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    } else {
      if(task.status === 'completed') {
        task.status = 'pending';
        task.completedAt = null;
      }
    }
    updateTaskById(task.id, {subtasks: task.subtasks, status: task.status}, true);
  }

  // Toggle subtask completion
  function toggleSubtaskCompletion(task, subtaskId) {
    const subtask = task.subtasks.find(st => st.id === subtaskId);
    if (!subtask) return;
    subtask.status = subtask.status === 'pending' ? 'completed' : 'pending';
    updateTaskStatusFromSubtasks(task);
    renderTaskDetails(task);
    renderTasks();
  }

  // Update timer display
  function updateTimerDisplay(seconds) {
    timeDisplayEl.textContent = formatDuration(seconds);
  }

  // Toggle timer start/stop
  function toggleTimer() {
    if (!selectedTaskId) return;
    if (taskTimer) {
      clearInterval(taskTimer);
      taskTimer = null;
      toggleTimerBtn.textContent = 'Start';
      // Calculate duration and save as timeEntry
      const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
      timerStartTime = null;
      const task = tasks.find(t => t.id === selectedTaskId);
      if (task) {
        task.timeSpent += elapsed;
        saveTimeEntry(selectedTaskId, elapsed);
        updateTaskById(selectedTaskId, {timeSpent: task.timeSpent});
      }
    } else {
      timerStartTime = Date.now();
      toggleTimerBtn.textContent = 'Stop';
      updateTimerInterval();
    }
  }

  // Timer interval updater
  function updateTimerInterval(){
    if(taskTimer) clearInterval(taskTimer);
    taskTimer = setInterval(() => {
      if (!timerStartTime) return;
      const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
      const task = tasks.find(t => t.id === selectedTaskId);
      if (task) updateTimerDisplay(task.timeSpent + elapsed);
    }, 1000);
  }

  // Reset timer for selected task
  function resetTimer() {
    if (!selectedTaskId) return;
    if (taskTimer) {
      clearInterval(taskTimer);
      taskTimer = null;
      toggleTimerBtn.textContent = 'Start';
    }
    timerStartTime = null;
    const task = tasks.find(t => t.id === selectedTaskId);
    if (task) {
      task.timeSpent = 0;
      updateTaskById(selectedTaskId, {timeSpent: 0});
      updateTimerDisplay(0);
    }
  }

  // Save time entry record
  function saveTimeEntry(taskId, durationSeconds) {
    const nowISO = new Date().toISOString();
    const timeEntry = {
      id: createUUID(),
      taskId,
      startTime: nowISO,
      endTime: nowISO,
      duration: durationSeconds,
      description: 'Manual segment',
    };
    timeEntries.push(timeEntry);
  }

  // Render projects
  function renderProjects() {
    projectListEl.innerHTML = '';
    projects.forEach(p => {
      const div = document.createElement('div');
      div.classList.add('project-item');
      if (p.id === currentProjectId) div.classList.add('selected');
      div.setAttribute('role', 'listitem');
      div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', `Project: ${p.name}`);

      // Color circle
      const colorCircle = document.createElement('div');
      colorCircle.classList.add('project-color');
      colorCircle.style.backgroundColor = p.color;
      div.appendChild(colorCircle);

      // Name
      const nameSpan = document.createElement('div');
      nameSpan.classList.add('project-name');
      nameSpan.textContent = p.name;
      div.appendChild(nameSpan);

      // Progress ring
      const progressRing = createProgressRing(p.progress, p.color);
      div.appendChild(progressRing);

      // Click select project
      div.addEventListener('click', () => {
        selectProject(p.id);
      });
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectProject(p.id);
        }
      });

      projectListEl.appendChild(div);
    });
  }
  // Create SVG progress ring for projects
  function createProgressRing(percentage, strokeColor) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'progress-svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.style.width = '32px';
    svg.style.height = '32px';

    const radius = 16;
    const circumference = 2 * Math.PI * radius;

    const bgCircle = document.createElementNS(ns, 'circle');
    bgCircle.classList.add('progress-bg');
    bgCircle.setAttribute('r', radius);
    bgCircle.setAttribute('cx', '18');
    bgCircle.setAttribute('cy', '18');

    const progressCircle = document.createElementNS(ns, 'circle');
    progressCircle.classList.add('progress-bar');
    const clamped = Math.min(Math.max(percentage, 0), 100);
    const offset = circumference * (1 - clamped / 100);
    progressCircle.setAttribute('stroke', strokeColor);
    progressCircle.setAttribute('r', radius);
    progressCircle.setAttribute('cx', '18');
    progressCircle.setAttribute('cy', '18');
    progressCircle.setAttribute('stroke-dasharray', circumference);
    progressCircle.setAttribute('stroke-dashoffset', offset);

    svg.appendChild(bgCircle);
    svg.appendChild(progressCircle);

    return svg;
  }

  // Select a project and filter tasks
  function selectProject(projectId) {
    if (currentProjectId === projectId) return;
    currentProjectId = projectId;
    renderProjects();
    renderTasks();
    selectedTaskId = null;
    closeDetailsPanel();
  }

  // Render tasks filtered by project and search query
  function renderTasks() {
    taskListEl.innerHTML = '';
    let filteredTasks = tasks.filter(t => t.projectId === currentProjectId);
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (searchTerm) {
      filteredTasks = filteredTasks.filter(t => 
        t.title.toLowerCase().includes(searchTerm) ||
        t.description.toLowerCase().includes(searchTerm) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
      );
    }

    if (filteredTasks.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.textContent = 'No tasks found.';
      emptyMsg.style.color = 'var(--color-text-light)';
      taskListEl.appendChild(emptyMsg);
      return;
    }

    filteredTasks.forEach(task => {
      const taskItem = createTaskElement(task);
      taskListEl.appendChild(taskItem);
    });

  }

  // Create DOM element for task item
  function createTaskElement(task) {
    const div = document.createElement('div');
    div.classList.add('task-item');
    if (bulkSelectIds.has(task.id)) div.style.borderColor = 'var(--color-primary)';
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'listitem');
    div.setAttribute('aria-label', `Task: ${task.title}. Priority: ${task.priority}. Due date: ${task.dueDate ?? 'none'}`);

    // Checkbox
    const checkboxContainer = document.createElement('label');
    checkboxContainer.classList.add('checkbox-container');
    checkboxContainer.setAttribute('aria-label', 'Mark task as complete');
    checkboxContainer.setAttribute('role', 'checkbox');
    checkboxContainer.setAttribute('aria-checked', task.status === 'completed');

    const checkboxInput = document.createElement('input');
    checkboxInput.type = 'checkbox';
    checkboxInput.checked = task.status === 'completed';
    checkboxInput.addEventListener('change', e => {
      e.stopPropagation();
      toggleTaskCompletion(task.id);
      updateBulkActions();
    });
    const customCheckbox = document.createElement('span');
    customCheckbox.classList.add('custom-checkbox');
    customCheckbox.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>';

    checkboxContainer.appendChild(checkboxInput);
    checkboxContainer.appendChild(customCheckbox);

    // Click on checkbox toggles selection for bulk actions also
    checkboxContainer.addEventListener('click', e => {
      e.stopPropagation();
    });

    div.appendChild(checkboxContainer);

    // Main task details container
    const mainDiv = document.createElement('div');
    mainDiv.classList.add('task-main');
    // task title
    const titleElem = document.createElement('div');
    titleElem.classList.add('task-title');
    if (task.status === 'completed') titleElem.classList.add('completed');
    titleElem.textContent = task.title;
    mainDiv.appendChild(titleElem);

    // Meta info: due date and priority
    const metaDiv = document.createElement('div');
    metaDiv.classList.add('task-meta');

    // Due date with overdue highlight
    if (task.dueDate) {
      const dueDateWrapper = document.createElement('div');
      dueDateWrapper.classList.add('due-date');
      const dueDateDate = new Date(task.dueDate);
      const now = new Date();
      if (dueDateDate < now && task.status !== 'completed') {
        dueDateWrapper.classList.add('overdue');
      }
      const iconSpan = document.createElement('span');
      iconSpan.className = 'material-icons due-icon';
      iconSpan.textContent = 'event';

      const dateText = dueDateDate.toLocaleDateString(undefined, {month:'short', day:'numeric'});

      dueDateWrapper.appendChild(iconSpan);
      dueDateWrapper.appendChild(document.createTextNode(dateText));
      metaDiv.appendChild(dueDateWrapper);
    }

    // Priority badge and circle indicator
    const prioSpan = document.createElement('span');
    prioSpan.classList.add('priority-badge');
    prioSpan.textContent = task.priority[0].toUpperCase() + task.priority.slice(1);
    switch(task.priority){
      case 'urgent': prioSpan.classList.add('priority-urgent'); break;
      case 'high': prioSpan.classList.add('priority-high'); break;
      case 'medium': prioSpan.classList.add('priority-medium'); break;
      case 'low': prioSpan.classList.add('priority-low'); break;
    }
    metaDiv.appendChild(prioSpan);

    mainDiv.appendChild(metaDiv);
    div.appendChild(mainDiv);

    // Priority color circle for quick visual
    const prioCircle = document.createElement('div');
    prioCircle.classList.add('priority-circle', task.priority);
    div.appendChild(prioCircle);

    // Task actions buttons container
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('task-actions');

    // Bulk select checkbox (separate from completion)
    const bulkSelectBtn = document.createElement('button');
    bulkSelectBtn.title = 'Select for bulk actions';
    bulkSelectBtn.setAttribute('aria-label', 'Select task for bulk actions');
    bulkSelectBtn.innerHTML = '<span class="material-icons">check_box_outline_blank</span>';
    if (bulkSelectIds.has(task.id)) {
      bulkSelectBtn.innerHTML = '<span class="material-icons">check_box</span>';
    }
    bulkSelectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(bulkSelectIds.has(task.id)){
        bulkSelectIds.delete(task.id);
      } else {
        bulkSelectIds.add(task.id);
      }
      renderTasks();
      updateBulkActions();
    });
    actionsDiv.appendChild(bulkSelectBtn);

    // View/edit button
    const editBtn = document.createElement('button');
    editBtn.title = 'View / Edit task details';
    editBtn.setAttribute('aria-label', 'View or edit task details');
    editBtn.innerHTML = '<span class="material-icons">open_in_new</span>';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showTaskDetails(task.id);
    });
    actionsDiv.appendChild(editBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.title = 'Delete task';
    delBtn.setAttribute('aria-label', 'Delete task');
    delBtn.innerHTML = '<span class="material-icons">delete</span>';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(confirm(`Delete task "${task.title}"?`)){
        deleteTaskById(task.id);
        updateBulkActions();
      }
    });
    actionsDiv.appendChild(delBtn);

    div.appendChild(actionsDiv);

    // Drag and Drop events
    div.setAttribute('draggable', true);
    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', task.id);
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', e => {
      div.classList.remove('dragging');
      clearDragOvers();
    });
    div.addEventListener('dragover', e => {
      e.preventDefault();
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', e => {
      div.classList.remove('drag-over');
    });
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('drag-over');
      const draggedTaskId = e.dataTransfer.getData('text/plain');
      if(draggedTaskId === task.id) return;
      reorderTasks(draggedTaskId, task.id);
    });

    return div;
  }

  function clearDragOvers() {
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  // Reordering tasks in array by moving dragged task before target task, scoped to same project
  function reorderTasks(draggedId, targetId) {
    const draggedIndex = tasks.findIndex(t => t.id === draggedId);
    const targetIndex = tasks.findIndex(t => t.id === targetId);
    if(draggedIndex === -1 || targetIndex === -1) return;
    if(tasks[draggedIndex].projectId !== tasks[targetIndex].projectId) return;
    const draggedTask = tasks.splice(draggedIndex, 1)[0];
    const insertIndex = targetIndex > draggedIndex ? targetIndex : targetIndex;
    tasks.splice(insertIndex, 0, draggedTask);
    renderTasks();
  }

  // Show task details on right panel
  function showTaskDetails(taskId) {
    selectedTaskId = taskId;
    const task = tasks.find(t => t.id === taskId);
    if(!task) return;
    renderTaskDetails(task);
    detailsPanel.hidden = false;
    detailsPanel.focus();
  }

  // Close task details panel
  function closeDetailsPanel() {
    selectedTaskId = null;
    if(taskTimer) {
      clearInterval(taskTimer);
      taskTimer = null;
      toggleTimerBtn.textContent = 'Start';
    }
    detailsPanel.hidden = true;
  }

  // Render details in right panel for a given task
  function renderTaskDetails(task) {
    taskTitleInput.value = task.title;
    taskDescriptionInput.value = task.description;
    renderSubtasks(task);
    updateTimerDisplay(task.timeSpent);
    if(taskTimer){
      clearInterval(taskTimer);
      taskTimer = null;
      toggleTimerBtn.textContent = 'Start';
    }
  }

  // Render subtasks for current selected task
  function renderSubtasks(task) {
    subtaskListEl.innerHTML = '';
    if(!task.subtasks || task.subtasks.length === 0){
      const noSubtasksMsg = document.createElement('p');
      noSubtasksMsg.textContent = 'No subtasks added.';
      noSubtasksMsg.style.color = 'var(--color-text-light)';
      subtaskListEl.appendChild(noSubtasksMsg);
      return;
    }
    task.subtasks.forEach(st => {
      const subDiv = document.createElement('div');
      subDiv.classList.add('subtask-item');
      if(st.status === 'completed') subDiv.classList.add('completed');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = st.status === 'completed';
      checkbox.id = `subtask_${st.id}`;
      checkbox.addEventListener('change', () => {
        toggleSubtaskCompletion(task, st.id);
      });

      const label = document.createElement('label');
      label.htmlFor = `subtask_${st.id}`;
      label.classList.add('subtask-title');
      label.textContent = st.title;

      subDiv.appendChild(checkbox);
      subDiv.appendChild(label);
      subtaskListEl.appendChild(subDiv);
    });
  }

  // Update bulk actions UI
  function updateBulkActions() {
    const count = bulkSelectIds.size;
    if (count > 0) {
      bulkCountEl.textContent = `${count} selected`;
      bulkActionsEl.classList.add('active');
      bulkActionsEl.classList.remove('hidden');
    } else {
      bulkActionsEl.classList.remove('active');
      bulkActionsEl.classList.add('hidden');
    }
  }

  // Add new task with smart parsing simulation (basic)
  function smartCreateTask(inputStr) {
    let title = inputStr;
    let priority = 'medium';
    let projectId = currentProjectId;
    let dueDate = null;

    const priorityMatch = inputStr.match(/\b(urgent|high|medium|low)\b/i);
    if(priorityMatch){
      priority = priorityMatch[0].toLowerCase();
      title = title.replace(priorityMatch[0], '').trim();
    }
    const projectMatch = inputStr.match(/project:([a-z0-9_-]+)/i);
    if(projectMatch){
      const projName = projectMatch[1].toLowerCase();
      const foundProject = projects.find(p => p.name.toLowerCase() === projName);
      if(foundProject){
        projectId = foundProject.id;
      }
      title = title.replace(projectMatch[0], '').trim();
    }
    const dueMatch = inputStr.match(/due:(\S+)/i);
    if(dueMatch){
      const dueVal = dueMatch[1].toLowerCase();
      if(dueVal === 'today') {
        dueDate = new Date();
      } else if(dueVal === 'tomorrow') {
        dueDate = new Date(Date.now() + 86400000);
      } else {
        const parsedDate = new Date(dueVal);
        if(!isNaN(parsedDate)) dueDate = parsedDate;
      }
      title = title.replace(dueMatch[0], '').trim();
      if(dueDate) dueDate = dueDate.toISOString().split('T')[0];
    }

    if (!title) title = 'New Task';

    return createTask({title, priority, projectId, dueDate});
  }

  // Event handlers
  searchInput.addEventListener('input', () => {
    renderTasks();
  });

  taskTitleInput.addEventListener('blur', () => {
    if (!selectedTaskId) return;
    updateTaskById(selectedTaskId, {title: taskTitleInput.value.trim()});
  });

  taskDescriptionInput.addEventListener('blur', () => {
    if (!selectedTaskId) return;
    updateTaskById(selectedTaskId, {description: taskDescriptionInput.value.trim()});
  });

  newSubtaskInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){
      e.preventDefault();
      if(!selectedTaskId) return;
      const task = tasks.find(t => t.id === selectedTaskId);
      if(!task) return;
      addSubtask(task, newSubtaskInput.value);
      newSubtaskInput.value = '';
    }
  });

  toggleTimerBtn.addEventListener('click', () => {
    toggleTimer();
  });

  resetTimerBtn.addEventListener('click', () => {
    resetTimer();
  });

  floatingFab.addEventListener('click', () => {
    const newTaskId = createTask({title: 'New Task', projectId: currentProjectId});
    renderTasks();
    showTaskDetails(newTaskId);
  });

  bulkMarkCompleteBtn.addEventListener('click', () => {
    bulkSelectIds.forEach(id => updateTaskById(id, {status: 'completed', completedAt: new Date().toISOString()}));
    bulkSelectIds.clear();
    renderTasks();
    updateBulkActions();
  });

  bulkDeleteBtn.addEventListener('click', () => {
    if(confirm(`Delete ${bulkSelectIds.size} tasks? This cannot be undone.`)){
      deleteTasksByIds(Array.from(bulkSelectIds));
      bulkSelectIds.clear();
      renderTasks();
      updateBulkActions();
    }
  });

  closeDetailsBtn.addEventListener('click', () => {
    closeDetailsPanel();
  });

  // Project modal handlers
  const openProjectModal = () => {
    projectNameInput.value = '';
    projectColorInput.value = '#f59e0b';
    projectModal.classList.add('active');
    projectModal.setAttribute('aria-hidden', 'false');
    projectModal.focus();
  };
  const closeProjectModal = () => {
    projectModal.classList.remove('active');
    projectModal.setAttribute('aria-hidden', 'true');
  };
  openProjectModalBtn.addEventListener('click', openProjectModal);
  sidebarAddProjectBtn.addEventListener('click', openProjectModal);
  cancelProjectModalBtn.addEventListener('click', closeProjectModal);
  saveProjectBtn.addEventListener('click', () => {
    const name = projectNameInput.value.trim();
    const color = projectColorInput.value;
    if(!name){
      alert('Please enter a project name.');
      projectNameInput.focus();
      return;
    }
    const id = createProject(name, color);
    selectProject(id);
    closeProjectModal();
  });
  projectModal.addEventListener('click', e => {
    if(e.target === projectModal){
      closeProjectModal();
    }
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      if(projectModal.classList.contains('active')){
        closeProjectModal();
      } else {
        closeDetailsPanel();
      }
    }
  });

  // Initialize with default inbox project
  function init(){
    projects = [{
      id: 'inbox',
      name: 'Inbox',
      description: 'Default Project',
      color: '#f59e0b',
      progress:0,
      deadline:null,
      members:[currentUser.id],
      settings:{}
    }];
    currentProjectId = 'inbox';

    // Sample data for demo
    createTask({title:'Create project #fancy', projectId:'inbox', priority:'urgent', dueDate:null});
    createTask({title:'Buy groceries', projectId:'inbox', priority:'medium', dueDate:new Date(Date.now()+86400000).toISOString().slice(0,10)});
    createTask({title:'Prepare presentation', projectId:'inbox', priority:'high', dueDate:null});
    createTask({title:'Call Alice', projectId:'inbox', priority:'low', dueDate:null});
    createTask({title:'Write blog post', projectId:'inbox', priority:'medium', dueDate:null});

    renderProjects();
    renderTasks();
  }
  init();

})();
