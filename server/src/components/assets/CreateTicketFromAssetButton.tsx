'use client';

import React, { useState } from 'react';
import { Asset } from '@/interfaces/asset.interfaces';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import CustomSelect, { SelectOption } from '@/components/ui/CustomSelect';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { createTicketFromAsset } from '@/lib/actions/ticket-actions/ticketActions';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { getCurrentUser } from '@/lib/actions/user-actions/userActions';

interface CreateTicketFromAssetButtonProps {
    asset: Asset;
}

export default function CreateTicketFromAssetButton({ asset }: CreateTicketFromAssetButtonProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [title, setTitle] = useState(`Issue with ${asset.name}`);
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    const priorityOptions: SelectOption[] = [
        { value: 'high', label: 'High' },
        { value: 'medium', label: 'Medium' },
        { value: 'low', label: 'Low' }
    ];

    const handleSubmit = async () => {
        if (!title.trim() || !description.trim() || !priority) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsSubmitting(true);

        try {
            const currentUser = await getCurrentUser();
            if (!currentUser) {
                toast.error('No user session found');
                return;
            }

            const ticket = await createTicketFromAsset({
                title,
                description,
                priority_id: priority,
                asset_id: asset.asset_id,
                company_id: asset.company_id
            }, currentUser);

            toast.success('Ticket created successfully');
            setIsDialogOpen(false);
            
            // Navigate to the new ticket
            router.push(`/msp/tickets/${ticket.ticket_id}`);
        } catch (error) {
            console.error('Error creating ticket:', error);
            toast.error('Failed to create ticket');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Button
                onClick={() => setIsDialogOpen(true)}
                variant="outline"
            >
                Create Ticket
            </Button>

            <Dialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                title="Create Ticket from Asset"
            >
                <div className="space-y-4">
                    <Input
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter ticket title"
                    />

                    <TextArea
                        label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe the issue..."
                        rows={4}
                    />

                    <CustomSelect
                        label="Priority"
                        options={priorityOptions}
                        value={priority}
                        onValueChange={setPriority}
                        placeholder="Select priority..."
                    />

                    <div className="mt-4 flex justify-end space-x-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Ticket'}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
}
