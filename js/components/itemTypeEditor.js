/* =============================
   Item Type Editor Component
   ============================= */

import { el, escapeHtml } from '../utils.js';
import {
  updateItemTypeData,
  deleteItemTypeData,
  createItemType,
  getAllItemTypes,
  generateKey
} from '../models/itemTypes.js';
import { reloadConfig } from '../config.js';

let currentEditingKey = null;
let currentSubTypeOptions = []; // Track sub-type options being edited

/**
 * Open the item type editor for an existing type
 */
export async function openItemTypeEditor(itemElement, typeKey) {
  const modal = el('itemTypesEditorModal');
  if (!modal) return;

  currentEditingKey = typeKey;

  const { getItemTypeByKey } = await import('../models/itemTypes.js');
  const itemType = await getItemTypeByKey(typeKey);

  if (!itemType) {
    console.error('Item type not found:', typeKey);
    return;
  }

  // Populate the editor
  el('itemTypeEditorTitle').textContent = 'Edit Item Type';
  el('itemTypeLabelInput').value = itemType.label || '';
  el('itemTypeIconInput').value = itemType.icon || '';

  // Set sub-type toggle
  const subTypeToggle = el('itemTypeSubTypeToggle');
  if (subTypeToggle) {
    subTypeToggle.checked = itemType.subTypeEnabled || false;
  }

  // Set sub-type options
  currentSubTypeOptions = itemType.subTypeOptions ? [...itemType.subTypeOptions] : [];

  // Reset input initialization flag
  const subTypeInput = el('itemTypeSubTypeOptions');
  if (subTypeInput) {
    subTypeInput.dataset.initialized = 'false';
  }

  // Update sub-type options visibility and render list
  updateSubTypeOptionsVisibility();
  renderSubTypeOptionsList();

  // Render fields
  renderFieldsEditor(itemType.fields || []);

  // Show delete button for existing types
  const deleteBtn = el('deleteItemTypeBtn');
  if (deleteBtn) deleteBtn.style.display = 'block';

  // Show the modal
  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // Position near the clicked element if possible
  if (itemElement) {
    const rect = itemElement.getBoundingClientRect();
    const modalContent = modal.querySelector('.item-type-editor-content');
    if (modalContent && rect.top < window.innerHeight / 2) {
      modalContent.style.marginTop = `${rect.bottom + 10}px`;
    }
  }
}

/**
 * Open the item type editor for creating a new type
 */
export function openCreateItemTypeEditor() {
  const modal = el('itemTypesEditorModal');
  if (!modal) return;

  currentEditingKey = null;

  // Clear the form
  el('itemTypeEditorTitle').textContent = 'Create Item Type';
  el('itemTypeLabelInput').value = '';
  el('itemTypeIconInput').value = '';

  // Clear sub-type toggle
  const subTypeToggle = el('itemTypeSubTypeToggle');
  if (subTypeToggle) {
    subTypeToggle.checked = false;
  }

  // Clear sub-type options
  currentSubTypeOptions = [];

  // Reset input initialization flag
  const subTypeInput = el('itemTypeSubTypeOptions');
  if (subTypeInput) {
    subTypeInput.dataset.initialized = 'false';
  }

  // Update sub-type options visibility and render list
  updateSubTypeOptionsVisibility();
  renderSubTypeOptionsList();

  // Render empty fields editor
  renderFieldsEditor([]);

  // Hide delete button for new types
  const deleteBtn = el('deleteItemTypeBtn');
  if (deleteBtn) deleteBtn.style.display = 'none';

  // Show the modal
  modal.classList.add('active');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

/**
 * Close the item type editor
 */
export function closeItemTypeEditor() {
  const modal = el('itemTypesEditorModal');
  if (!modal) return;

  modal.classList.remove('active');
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  currentEditingKey = null;
  currentSubTypeOptions = [];
}

/**
 * Update the visibility of sub-type options based on toggle
 */
function updateSubTypeOptionsVisibility() {
  const subTypeToggle = el('itemTypeSubTypeToggle');
  const subTypeOptionsContainer = el('itemTypeSubTypeOptionsContainer');

  if (subTypeToggle && subTypeOptionsContainer) {
    const isEnabled = subTypeToggle.checked;
    subTypeOptionsContainer.style.display = isEnabled ? 'block' : 'none';

    // Setup input handlers when container becomes visible
    if (isEnabled) {
      setupSubTypeInputHandlers();
    }
  }
}

/**
 * Render the list of sub-type options
 */
function renderSubTypeOptionsList() {
  const container = el('selectedSubTypeOptions');
  if (!container) return;

  if (!currentSubTypeOptions || currentSubTypeOptions.length === 0) {
    container.innerHTML = '<div class="empty-places">No sub-types added yet</div>';
    return;
  }

  let html = '<div class="place-list">';
  currentSubTypeOptions.forEach((option, index) => {
    html += `<div class="place-tag" data-option-index="${index}">`;
    html += `<span class="place-tag-name">${escapeHtml(option)}</span>`;
    html += `<button class="place-tag-remove" data-option-index="${index}" type="button">×</button>`;
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;

  // Add remove handlers
  container.querySelectorAll('.place-tag-remove').forEach(btn => {
    btn.onclick = () => {
      const index = Number(btn.getAttribute('data-option-index'));
      currentSubTypeOptions.splice(index, 1);
      renderSubTypeOptionsList();
      // Trigger input event to update add button visibility
      const input = el('itemTypeSubTypeOptions');
      if (input) {
        input.dispatchEvent(new Event('input'));
      }
    };
  });
}

/**
 * Setup sub-type input handlers (add button, input events)
 */
function setupSubTypeInputHandlers() {
  const input = el('itemTypeSubTypeOptions');
  const addBtn = el('subTypeAddBtn');

  if (!input || !addBtn) return;

  // Check if already initialized to prevent duplicate listeners
  if (input.dataset.initialized === 'true') return;
  input.dataset.initialized = 'true';

  // Show/hide add button based on input value
  const updateAddButton = () => {
    const value = input.value.trim();
    if (value && !currentSubTypeOptions.includes(value)) {
      addBtn.classList.remove('hidden');
    } else {
      addBtn.classList.add('hidden');
    }
  };

  // Add option from input
  const addOptionFromInput = () => {
    const value = input.value.trim();
    if (!value) return;

    if (currentSubTypeOptions.includes(value)) {
      alert('This sub-type option is already added.');
      return;
    }

    currentSubTypeOptions.push(value);
    input.value = '';
    renderSubTypeOptionsList();
    updateAddButton();
  };

  // Input event to show/hide add button
  input.oninput = updateAddButton;

  // Add button click
  addBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addOptionFromInput();
  };

  // Enter key to add option
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOptionFromInput();
    }
  };
}

/**
 * Render the fields editor section
 */
function renderFieldsEditor(fields) {
  const container = el('itemTypeFieldsList');
  if (!container) return;

  container.innerHTML = '';

  fields.forEach((field, index) => {
    const fieldDiv = createFieldRow(field, index);
    container.appendChild(fieldDiv);
  });

  // Add empty row for adding new field
  const addButton = document.createElement('button');
  addButton.className = 'btn secondary btn-sm';
  addButton.type = 'button';
  addButton.textContent = '+ Add Field';
  addButton.style.marginTop = '12px';
  addButton.addEventListener('click', () => {
    const newField = { name: '', label: '', type: 'string', options: [] };
    const newFieldRow = createFieldRow(newField, fields.length);
    container.insertBefore(newFieldRow, addButton);
  });
  container.appendChild(addButton);
}

/**
 * Create a single field row for editing
 */
function createFieldRow(field, index) {
  const fieldDiv = document.createElement('div');
  fieldDiv.className = 'item-type-field-row';
  fieldDiv.setAttribute('data-index', index);

  // Store options in a data attribute
  fieldDiv._fieldOptions = field.options ? [...field.options] : [];

  // Line 1: Label input (name will be auto-generated)
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'Field name (e.g., Color, Vintage, Producer)';
  labelInput.value = field.label || '';
  labelInput.className = 'field-label-input';

  // Line 2: Type selector
  const typeSelect = document.createElement('select');
  typeSelect.className = 'field-type-select';
  typeSelect.innerHTML = `
    <option value="string" ${field.type === 'string' ? 'selected' : ''}>Text</option>
    <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
    <option value="enum" ${field.type === 'enum' ? 'selected' : ''}>Dropdown</option>
  `;

  // Line 3: Options input container (only visible for enum)
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'field-options-container';
  optionsContainer.style.display = field.type === 'enum' ? 'block' : 'none';

  // Create input wrapper similar to barcode input
  const optionsInputWrapper = document.createElement('div');
  optionsInputWrapper.className = 'barcode-input-wrapper';
  optionsInputWrapper.style.marginBottom = '8px';

  const optionsInput = document.createElement('input');
  optionsInput.type = 'text';
  optionsInput.placeholder = 'Enter an option...';
  optionsInput.className = 'field-options-input barcode-input';

  const optionsAddBtn = document.createElement('button');
  optionsAddBtn.className = 'place-add-btn hidden';
  optionsAddBtn.type = 'button';
  optionsAddBtn.title = 'Add option';
  optionsAddBtn.textContent = '+';

  optionsInputWrapper.appendChild(optionsInput);
  optionsInputWrapper.appendChild(optionsAddBtn);

  // Create list container for options
  const optionsList = document.createElement('div');
  optionsList.className = 'selected-barcodes';

  optionsContainer.appendChild(optionsInputWrapper);
  optionsContainer.appendChild(optionsList);

  // Function to render options list
  const renderOptionsList = () => {
    if (!fieldDiv._fieldOptions || fieldDiv._fieldOptions.length === 0) {
      optionsList.innerHTML = '<div class="empty-places">No options added yet</div>';
      return;
    }

    let html = '<div class="place-list">';
    fieldDiv._fieldOptions.forEach((option, optIndex) => {
      html += `<div class="place-tag" data-option-index="${optIndex}">`;
      html += `<span class="place-tag-name">${escapeHtml(option)}</span>`;
      html += `<button class="place-tag-remove" data-option-index="${optIndex}" type="button">×</button>`;
      html += '</div>';
    });
    html += '</div>';
    optionsList.innerHTML = html;

    // Add remove handlers
    optionsList.querySelectorAll('.place-tag-remove').forEach(btn => {
      btn.onclick = () => {
        const optIndex = Number(btn.getAttribute('data-option-index'));
        fieldDiv._fieldOptions.splice(optIndex, 1);
        renderOptionsList();
        // Trigger input event to update add button visibility
        optionsInput.dispatchEvent(new Event('input'));
      };
    });
  };

  // Setup input handlers for options
  const updateAddButton = () => {
    const value = optionsInput.value.trim();
    if (value && !fieldDiv._fieldOptions.includes(value)) {
      optionsAddBtn.classList.remove('hidden');
    } else {
      optionsAddBtn.classList.add('hidden');
    }
  };

  const addOptionFromInput = () => {
    const value = optionsInput.value.trim();
    if (!value) return;

    if (fieldDiv._fieldOptions.includes(value)) {
      alert('This option is already added.');
      return;
    }

    fieldDiv._fieldOptions.push(value);
    optionsInput.value = '';
    renderOptionsList();
    updateAddButton();
  };

  optionsInput.oninput = updateAddButton;

  optionsAddBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addOptionFromInput();
  };

  optionsInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOptionFromInput();
    }
  };

  // Initial render of options list
  renderOptionsList();

  typeSelect.addEventListener('change', () => {
    optionsContainer.style.display = typeSelect.value === 'enum' ? 'block' : 'none';
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn danger btn-sm field-delete-btn';
  deleteBtn.type = 'button';
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Remove field';
  deleteBtn.addEventListener('click', () => {
    fieldDiv.remove();
  });

  // Assemble the row
  const header = document.createElement('div');
  header.className = 'field-row-header';
  header.appendChild(labelInput);
  header.appendChild(deleteBtn);

  fieldDiv.appendChild(header);
  fieldDiv.appendChild(typeSelect);
  fieldDiv.appendChild(optionsContainer);

  return fieldDiv;
}

/**
 * Save the item type
 */
export async function saveItemType() {
  const label = el('itemTypeLabelInput').value.trim();
  const icon = el('itemTypeIconInput').value.trim();
  const subTypeToggle = el('itemTypeSubTypeToggle');

  const subTypeEnabled = subTypeToggle ? subTypeToggle.checked : false;
  const subTypeOptions = [...currentSubTypeOptions];

  if (!label) {
    alert('Please provide a label for the item type.');
    return;
  }

  // Collect fields
  const fieldsContainer = el('itemTypeFieldsList');
  const fieldRows = fieldsContainer.querySelectorAll('.item-type-field-row');
  const fields = [];

  fieldRows.forEach(row => {
    const labelInput = row.querySelector('.field-label-input');
    const typeSelect = row.querySelector('.field-type-select');

    const fieldLabel = labelInput ? labelInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : 'string';

    if (fieldLabel) {
      // Auto-generate field name from label
      const fieldName = generateKey(fieldLabel);

      const field = { name: fieldName, label: fieldLabel, type };

      if (type === 'enum') {
        // Get options from the stored _fieldOptions array
        field.options = row._fieldOptions ? [...row._fieldOptions] : [];
      }

      fields.push(field);
    }
  });

  try {
    if (currentEditingKey) {
      // Update existing
      await updateItemTypeData(currentEditingKey, { label, icon, fields, subTypeEnabled, subTypeOptions });
    } else {
      // Create new - generate key from label
      const key = generateKey(label);

      // Check if key already exists
      const allTypes = await getAllItemTypes();
      if (allTypes[key]) {
        alert(`An item type with this name already exists (generated key: "${key}"). Please use a different name.`);
        return;
      }

      // Get max rank and add 1
      const ranks = Object.values(allTypes).map(t => t.rank || 0);
      const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;

      await createItemType(key, label, icon, fields);
      // Update rank and sub-type settings to be at the end
      const { updateItemType } = await import('../db.js');
      await updateItemType(key, { rank: maxRank + 1, subTypeEnabled, subTypeOptions });
    }

    // Reload config to update the app
    await reloadConfig();

    closeItemTypeEditor();
  } catch (e) {
    console.error('Failed to save item type:', e);
    alert('Failed to save item type: ' + e.message);
  }
}

/**
 * Delete the current item type
 */
export async function deleteItemType() {
  if (!currentEditingKey) return;

  if (!confirm(`Are you sure you want to delete the "${currentEditingKey}" item type? This action cannot be undone.`)) {
    return;
  }

  try {
    await deleteItemTypeData(currentEditingKey);
    await reloadConfig();
    closeItemTypeEditor();
  } catch (e) {
    console.error('Failed to delete item type:', e);
    alert('Failed to delete item type: ' + e.message);
  }
}

/**
 * Initialize the item type editor event listeners
 */
export function initItemTypeEditor() {
  const saveBtn = el('saveItemTypeBtn');
  const cancelBtn = el('cancelItemTypeBtn');
  const deleteBtn = el('deleteItemTypeBtn');
  const modal = el('itemTypesEditorModal');

  if (saveBtn) {
    saveBtn.addEventListener('click', saveItemType);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeItemTypeEditor);
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteItemType);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeItemTypeEditor();
      }
    });
  }

  // Setup sub-type toggle event listener
  const subTypeToggle = el('itemTypeSubTypeToggle');
  if (subTypeToggle) {
    subTypeToggle.addEventListener('change', updateSubTypeOptionsVisibility);
  }

  // Block browser extensions from analyzing input fields
  const blockExtensions = (input) => {
    if (!input) return;

    // Comprehensive list of attributes to block various extensions
    const attrs = {
      'autocomplete': 'off',
      'data-1p-ignore': 'true',
      'data-lpignore': 'true',
      'data-form-type': 'other',
      'data-bwignore': 'true', // Bitwarden
      'data-dashlane-ignore': 'true', // Dashlane
      'data-kwimpalastatus': 'false', // Keeper
      'data-lastpass-ignore': 'true', // LastPass
      'data-np-checked': '1', // Norton
      'data-ms-editor': 'false', // Microsoft Editor
      'data-gramm': 'false', // Grammarly
      'data-gramm_editor': 'false', // Grammarly
      'spellcheck': 'false'
    };

    Object.entries(attrs).forEach(([key, value]) => {
      input.setAttribute(key, value);
    });

    // Add to input element's dataset to prevent classification
    input.dataset.noExtensions = 'true';

    // Remove readonly to make it editable
    input.removeAttribute('readonly');
  };

  // Apply blocking to item type editor inputs
  const labelInput = el('itemTypeLabelInput');
  const iconInput = el('itemTypeIconInput');

  blockExtensions(labelInput);
  blockExtensions(iconInput);

  // Re-apply blocking when modal opens (in case extensions re-analyze)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target === modal && modal.classList.contains('active')) {
        // Small delay to ensure inputs are rendered
        setTimeout(() => {
          const label = el('itemTypeLabelInput');
          const icon = el('itemTypeIconInput');

          // First set readonly to block extensions
          if (label) label.setAttribute('readonly', 'true');
          if (icon) icon.setAttribute('readonly', 'true');

          // Then after a tiny delay, remove readonly and apply blocking
          setTimeout(() => {
            blockExtensions(label);
            blockExtensions(icon);
          }, 100);
        }, 50);
      }
    });
  });

  if (modal) {
    observer.observe(modal, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
}

