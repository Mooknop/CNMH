import React from 'react';
import Modal from '../shared/Modal';
import PF2E_CONDITIONS from '../../data/pf2eConditions';
import './ConditionModal.css';

const ConditionModal = ({
  isOpen,
  onClose,
  themeColor,
  activeConditions,
  onAdd,
  onRemove,
  onChangeValue,
  highZ = false,
}) => {
  const activeIds = new Set(activeConditions.map((c) => c.id));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Condition Tracker"
      themeColor={themeColor}
      maxWidth="680px"
      highZ={highZ}
    >
      {/* ── Active conditions ── */}
      <section className="ct-section">
        <h3 className="ct-section-title">Active Conditions</h3>
        {activeConditions.length === 0 ? (
          <p className="ct-empty">No active conditions.</p>
        ) : (
          <ul className="ct-active-list">
            {activeConditions.map((cond) => (
              <li key={cond.id} className="ct-active-card">
                <div className="ct-active-header">
                  <span className="ct-active-name">
                    {cond.name}
                    {cond.valued && (
                      <span className="ct-value-badge">
                        {cond.value}
                      </span>
                    )}
                  </span>
                  <div className="ct-active-controls">
                    {cond.valued && (
                      <>
                        <button
                          className="ct-ctrl-btn"
                          onClick={() => onChangeValue(cond.id, -1)}
                          title="Decrement"
                        >
                          −
                        </button>
                        <button
                          className="ct-ctrl-btn"
                          onClick={() => onChangeValue(cond.id, 1)}
                          title="Increment"
                          disabled={cond.value >= cond.maxValue}
                        >
                          +
                        </button>
                      </>
                    )}
                    <button
                      className="ct-remove-btn"
                      onClick={() => onRemove(cond.id)}
                      title="Remove condition"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <p className="ct-active-effect">{cond.effect(cond.value)}</p>
                {cond.decrements && (
                  <span className="ct-decrement-tag">Decrements each round</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="ct-divider" />

      {/* ── Condition browser ── */}
      <section className="ct-section">
        <h3 className="ct-section-title">Add Condition</h3>
        <div className="ct-browser-grid">
          {PF2E_CONDITIONS.map((cond) => {
            const isActive = activeIds.has(cond.id) && !cond.valued;
            return (
              <button
                key={cond.id}
                className={`ct-browser-card${isActive ? ' ct-browser-card--active' : ''}`}
                onClick={() => onAdd(cond)}
                title={cond.summary}
                style={isActive ? { borderColor: themeColor, color: themeColor } : {}}
              >
                <span className="ct-browser-name">{cond.name}</span>
                {cond.valued && <span className="ct-browser-valued-tag">Valued</span>}
                <span className="ct-browser-summary">{cond.summary}</span>
              </button>
            );
          })}
        </div>
      </section>
    </Modal>
  );
};

export default ConditionModal;
