'use client';

import React from 'react';
import { Button } from '../ui/Button';
import { IWorkItem } from '../../interfaces/workItem.interfaces';

interface SelectedWorkItemProps {
  workItem: Omit<IWorkItem, 'tenant'> | null;
  onEdit: () => void;
}

const SelectedWorkItem: React.FC<SelectedWorkItemProps> = ({ workItem, onEdit }) => {
  if (!workItem) {
    return (
      <div className="flex justify-between items-center p-2">
        <span className="font-bold text-black">Ad-hoc entry (no work item)</span>
        <Button onClick={onEdit} variant="outline" size="sm" id="select-work-item-btn">
          Select Work Item
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center p-2">
      <div>
        <div className="font-medium">{workItem.name}</div>
        <div className="text-sm text-gray-500 capitalize">{workItem.type.replace('_', ' ')}</div>
      </div>
      <Button onClick={onEdit} variant="outline" size="sm" id="change-work-item-btn">
        Change
      </Button>
    </div>
  );
};

export default SelectedWorkItem;
